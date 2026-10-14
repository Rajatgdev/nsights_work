/**
 * Presentations API (build spec §9, §10). TENANT tables — every DB op runs
 * inside withTenant() so RLS enforces firm isolation. A presentation pins the
 * live data_version at creation; "refresh-data" re-pins it to current live
 * (exact regeneration of any past export works from the stored version).
 *
 * Commentary generation (/slides/:id/commentary/*) is wired in Stage 3; here it
 * returns the deterministic fallback so the flow works without AI.
 * Export (/:id/export) is wired in Stage 4.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db, withTenant } from '@nsights/db';
import { chartRegistry, type ChartContext } from '@nsights/charts';
import { CHART_KEYS, COMPARE_MODES, type ChartKey, type CompareMode } from '@nsights/shared';
import type { AppEnv, FirmMembership } from '../context';
import { requireDownload } from '../middleware/guard';

export const presentations = new Hono<AppEnv>();

presentations.use('*', async (c, next) => {
  if (!c.get('membership')) return c.json({ error: 'no_firm' }, 403);
  await next();
});

function tenantCtx(m: FirmMembership, userId: string) {
  return { firmId: m.firmId, userId, role: m.role };
}
function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
async function liveVersionId(): Promise<string> {
  const r = await db.execute(sql`select live_version_id as id from platform_state where id = 1`);
  const id = (r.rows[0] as { id: string } | undefined)?.id;
  if (!id) throw new Error('no_live_version');
  return id;
}

const SLIDE_KINDS = ['cover', 'chart', 'summary', 'portfolio', 'team', 'philosophy', 'strategy', 'disclaimer'] as const;
type SlideKind = (typeof SLIDE_KINDS)[number];
const TEMPLATES = ['boardroom', 'editorial', 'monoline'] as const;

// ── GET /api/presentations — list (own by default; firm_admin sees all) ──
presentations.get('/', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const rows = await withTenant(tenantCtx(m, user.id), async (tx) => {
    // advisers see their own; firm_admin sees the firm's (spec §1: "own only [OPEN]")
    const scope = m.role === 'firm_admin' ? sql`` : sql`where p.created_by = ${user.id}`;
    const r = await tx.execute(sql`
      select p.id, p.title, p.client_name, p.adviser_name, p.template_id, p.compare_mode,
             p.status, p.created_by, p.created_at,
             (select count(*) from slide s where s.presentation_id = p.id) as slides
        from presentation p ${scope}
       order by p.created_at desc
    `);
    return r.rows as Record<string, unknown>[];
  });
  return c.json({
    presentations: rows.map((p) => ({
      id: p.id, title: p.title, clientName: p.client_name, adviserName: p.adviser_name,
      templateId: p.template_id, compareMode: p.compare_mode, status: p.status,
      createdBy: p.created_by, slides: Number(p.slides),
    })),
  });
});

// ── POST /api/presentations — create (pins live version) ──
presentations.post('/', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }
  const title = String(body.title ?? '').trim();
  if (!title) return c.json({ error: 'title_required' }, 400);

  const templateId = TEMPLATES.includes(body.templateId as (typeof TEMPLATES)[number]) ? body.templateId : 'boardroom';
  const compareMode: CompareMode = COMPARE_MODES.includes(body.compareMode as CompareMode) ? (body.compareMode as CompareMode) : 'common';

  let versionId: string;
  try { versionId = await liveVersionId(); } catch { return c.json({ error: 'no_live_version' }, 503); }

  const id = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const r = await tx.execute(sql`
      insert into presentation (firm_id, created_by, title, client_name, adviser_name, data_version_id, template_id, palette_id, compare_mode, status)
      values (${m.firmId}, ${user.id}, ${title}, ${body.clientName ?? null}, ${body.adviserName ?? user.email},
              ${versionId}, ${templateId}, ${body.paletteId ?? 'default'}, ${compareMode}, 'draft')
      returning id
    `);
    const pid = (r.rows[0] as { id: string }).id;
    // seed a cover + disclaimer so a new deck is never empty
    await tx.execute(sql`insert into slide (presentation_id, firm_id, position, kind, commentary_enabled) values
      (${pid}, ${m.firmId}, 0, 'cover', false),
      (${pid}, ${m.firmId}, 1, 'disclaimer', false)`);
    return pid;
  });
  return c.json({ id }, 201);
});

// ── GET /api/presentations/:id — detail + slides ──
presentations.get('/:id', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  const data = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const pr = await tx.execute(sql`select * from presentation where id = ${id}`);
    const p = pr.rows[0] as Record<string, unknown> | undefined;
    if (!p) return null;
    const sr = await tx.execute(sql`
      select id, position, kind, chart_key, fund_ids, portfolio_id, options,
             commentary_enabled, commentary_text, commentary_edited
        from slide where presentation_id = ${id} order by position
    `);
    return { p, slides: sr.rows as Record<string, unknown>[] };
  });
  if (!data) return c.json({ error: 'not_found' }, 404);
  const p = data.p;
  return c.json({
    presentation: {
      id: p.id, title: p.title, clientName: p.client_name, adviserName: p.adviser_name,
      dataVersionId: p.data_version_id, templateId: p.template_id, paletteId: p.palette_id,
      compareMode: p.compare_mode, status: p.status, createdBy: p.created_by,
    },
    slides: data.slides.map(slideOut),
  });
});

// ── PATCH /api/presentations/:id — meta ──
presentations.patch('/:id', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }

  const ok = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const ex = await tx.execute(sql`select id from presentation where id = ${id}`);
    if (ex.rows.length === 0) return false;
    await tx.execute(sql`
      update presentation set
        title = coalesce(${body.title ?? null}, title),
        client_name = ${body.clientName === undefined ? sql`client_name` : (body.clientName ?? null)},
        adviser_name = ${body.adviserName === undefined ? sql`adviser_name` : (body.adviserName ?? null)},
        template_id = coalesce(${body.templateId ?? null}, template_id),
        palette_id = coalesce(${body.paletteId ?? null}, palette_id),
        compare_mode = coalesce(${body.compareMode ?? null}, compare_mode),
        status = coalesce(${body.status ?? null}, status),
        updated_at = now()
      where id = ${id}
    `);
    return true;
  });
  return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

// ── DELETE /api/presentations/:id ──
presentations.delete('/:id', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  const ok = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const ex = await tx.execute(sql`select id from presentation where id = ${id}`);
    if (ex.rows.length === 0) return false;
    await tx.execute(sql`delete from presentation where id = ${id}`);
    return true;
  });
  return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

// ── POST /api/presentations/:id/slides — add a slide ──
presentations.post('/:id/slides', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }
  const kind = (SLIDE_KINDS.includes(body.kind as SlideKind) ? body.kind : 'chart') as SlideKind;
  const chartKey = kind === 'chart' && CHART_KEYS.includes(body.chartKey as ChartKey) ? (body.chartKey as ChartKey) : null;
  const fundIds = Array.isArray(body.fundIds) ? (body.fundIds as unknown[]).map(String) : null;
  const portfolioId = body.portfolioId ? String(body.portfolioId) : null;

  const result = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const ex = await tx.execute(sql`select id from presentation where id = ${id}`);
    if (ex.rows.length === 0) return null;
    const posR = await tx.execute(sql`select coalesce(max(position), -1) + 1 as pos from slide where presentation_id = ${id}`);
    const pos = Number((posR.rows[0] as { pos: number }).pos);
    const r = await tx.execute(sql`
      insert into slide (presentation_id, firm_id, position, kind, chart_key, fund_ids, portfolio_id, options, commentary_enabled)
      values (${id}, ${m.firmId}, ${pos}, ${kind}, ${chartKey},
              ${fundIds ? sql`${'{' + fundIds.join(',') + '}'}::uuid[]` : null}, ${portfolioId}, ${body.options ? JSON.stringify(body.options) : null}, ${kind === 'chart'})
      returning id
    `);
    return (r.rows[0] as { id: string }).id;
  });
  return result ? c.json({ id: result }, 201) : c.json({ error: 'not_found' }, 404);
});

// ── POST /api/presentations/:id/reorder — { slideIds: [...] } ──
presentations.post('/:id/reorder', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  let body: { slideIds?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }
  const ids = Array.isArray(body.slideIds) ? (body.slideIds as unknown[]).map(String) : [];
  if (ids.length === 0) return c.json({ error: 'no_slides' }, 400);

  await withTenant(tenantCtx(m, user.id), async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.execute(sql`update slide set position = ${i}, updated_at = now() where id = ${ids[i]} and presentation_id = ${id}`);
    }
  });
  return c.json({ ok: true });
});

// ── POST /api/presentations/:id/refresh-data — re-pin to current live ──
presentations.post('/:id/refresh-data', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  let versionId: string;
  try { versionId = await liveVersionId(); } catch { return c.json({ error: 'no_live_version' }, 503); }
  const ok = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const ex = await tx.execute(sql`select id from presentation where id = ${id}`);
    if (ex.rows.length === 0) return false;
    await tx.execute(sql`update presentation set data_version_id = ${versionId}, updated_at = now() where id = ${id}`);
    return true;
  });
  return ok ? c.json({ ok: true, dataVersionId: versionId }) : c.json({ error: 'not_found' }, 404);
});

// ── PATCH /api/presentations/slides/:id — edit one slide ──
presentations.patch('/slides/:id', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const sid = c.req.param('id');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }

  const ok = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const ex = await tx.execute(sql`select id from slide where id = ${sid}`);
    if (ex.rows.length === 0) return false;
    const fundIds = body.fundIds === undefined ? null : (Array.isArray(body.fundIds) ? (body.fundIds as unknown[]).map(String) : []);
    await tx.execute(sql`
      update slide set
        chart_key = ${body.chartKey === undefined ? sql`chart_key` : (body.chartKey ?? null)},
        fund_ids = ${body.fundIds === undefined ? sql`fund_ids` : (fundIds && fundIds.length ? sql`${'{' + fundIds.join(',') + '}'}::uuid[]` : null)},
        portfolio_id = ${body.portfolioId === undefined ? sql`portfolio_id` : (body.portfolioId ?? null)},
        options = ${body.options === undefined ? sql`options` : (body.options ? JSON.stringify(body.options) : null)},
        commentary_enabled = ${body.commentaryEnabled === undefined ? sql`commentary_enabled` : !!body.commentaryEnabled},
        commentary_text = ${body.commentaryText === undefined ? sql`commentary_text` : (body.commentaryText ?? null)},
        commentary_edited = ${body.commentaryText === undefined ? sql`commentary_edited` : true},
        updated_at = now()
      where id = ${sid}
    `);
    return true;
  });
  return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

// ── DELETE a slide ──
presentations.delete('/slides/:id', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const sid = c.req.param('id');
  const ok = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const ex = await tx.execute(sql`select id from slide where id = ${sid}`);
    if (ex.rows.length === 0) return false;
    await tx.execute(sql`delete from slide where id = ${sid}`);
    return true;
  });
  return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

// ── Commentary (Stage 3 wires AI; for now returns the chart fallback) ──
presentations.post('/slides/:id/commentary/generate', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const sid = c.req.param('id');

  const text = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const sr = await tx.execute(sql`
      select s.chart_key, s.fund_ids, s.portfolio_id, p.data_version_id, p.compare_mode
        from slide s join presentation p on p.id = s.presentation_id where s.id = ${sid}
    `);
    const s = sr.rows[0] as Record<string, unknown> | undefined;
    if (!s) return null;
    const key = s.chart_key as ChartKey | null;
    if (!key || !chartRegistry.has(key)) return '';
    const fundIds = (s.fund_ids as string[] | null) ?? [];
    const facts = await chartFacts(key, fundIds, s.compare_mode as CompareMode, s.data_version_id as string);
    const def = chartRegistry.get(key)!;
    const fallback = def.fallback(facts);
    // Stage 3: try Vertex, validate, else keep fallback. For now: fallback.
    await tx.execute(sql`
      update slide set commentary_generated = ${fallback}, commentary_text = ${fallback},
        commentary_model = 'fallback', commentary_edited = false, updated_at = now()
      where id = ${sid}
    `);
    return fallback;
  });
  if (text === null) return c.json({ error: 'not_found' }, 404);
  return c.json({ text, model: 'fallback' });
});

presentations.post('/slides/:id/commentary/reset', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const sid = c.req.param('id');
  const ok = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const ex = await tx.execute(sql`select id from slide where id = ${sid}`);
    if (ex.rows.length === 0) return false;
    await tx.execute(sql`update slide set commentary_text = commentary_generated, commentary_edited = false, updated_at = now() where id = ${sid}`);
    return true;
  });
  return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

// ── Export (Stage 4 implements; stub for now) ──
presentations.post('/:id/export', requireDownload(), (c) => c.json({ error: 'not_implemented', stage: 4 }, 501));
presentations.get('/exports/:id', (c) => c.json({ error: 'not_implemented', stage: 4 }, 501));

// ── helpers ──
function slideOut(s: Record<string, unknown>) {
  return {
    id: s.id, position: Number(s.position), kind: s.kind, chartKey: s.chart_key,
    fundIds: s.fund_ids ?? [], portfolioId: s.portfolio_id, options: s.options,
    commentaryEnabled: s.commentary_enabled, commentaryText: s.commentary_text,
    commentaryEdited: s.commentary_edited,
  };
}

/** Compute a chart's facts for a slide (platform data, no RLS). */
async function chartFacts(key: ChartKey, fundIds: string[], compareMode: CompareMode, versionId: string): Promise<Record<string, number | string>> {
  const def = chartRegistry.get(key);
  if (!def || fundIds.length === 0) return {};
  const dr = await db.execute(sql`select distinct price_date from fund_price where version_id = ${versionId} order by price_date`);
  const dates = (dr.rows as { price_date: unknown }[]).map((x) => isoDate(x.price_date));
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const nameRes = await db.execute(sql`select id, name from fund where id in (${sql.join(fundIds.map((id) => sql`${id}`), sql`, `)})`);
  const nameById = new Map((nameRes.rows as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const seriesMap = new Map<string, (number | null)[]>();
  for (const id of fundIds) seriesMap.set(id, new Array(dates.length).fill(null));
  const pr = await db.execute(sql`select fund_id, price_date, price from fund_price where version_id = ${versionId} and fund_id in (${sql.join(fundIds.map((id) => sql`${id}`), sql`, `)})`);
  for (const row of pr.rows as { fund_id: string; price_date: unknown; price: string }[]) {
    const col = seriesMap.get(row.fund_id); const idx = dateIndex.get(isoDate(row.price_date));
    if (col && idx != null) col[idx] = Number(row.price);
  }
  const ctxFunds = fundIds.filter((id) => nameById.has(id)).map((id) => ({ id, name: nameById.get(id)!, series: seriesMap.get(id) ?? [], dates }));
  let startIndex = 0;
  if (compareMode === 'common') for (const f of ctxFunds) { const fi = f.series.findIndex((v) => v != null); if (fi > startIndex) startIndex = fi; }
  const ctx: ChartContext = { versionId, funds: ctxFunds, compareMode, window: { startIndex } };
  return def.facts(def.data(ctx));
}
