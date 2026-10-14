/**
 * Fund data + chart data API (build spec §10, §6, §7).
 *
 * Fund data is PLATFORM-OWNED (no firm_id, outside tenant RLS), so these
 * handlers read via `db` directly — no withTenant(). Any authenticated user
 * (adviser, assistant, firm_admin) may read the live fund universe.
 *
 * Everything is pinned to the current LIVE data_version (platform_state.
 * live_version_id). Metrics come precomputed from fund_metric (§6); price
 * series come from fund_price aligned to the version's global month index.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '@nsights/db';
import { chartRegistry, type ChartContext } from '@nsights/charts';
import { CHART_KEYS, COMPARE_MODES, type ChartKey, type CompareMode } from '@nsights/shared';
import type { AppEnv } from '../context';

export const funds = new Hono<AppEnv>();

// ── helpers ──────────────────────────────────────────────────

/** Resolve the current live version id + its data month. Throws if none. */
async function liveVersion(): Promise<{ id: string; dataMonth: string }> {
  const r = await db.execute(sql`
    select dv.id, dv.data_month
      from platform_state ps
      join data_version dv on dv.id = ps.live_version_id
     where ps.id = 1
  `);
  const row = r.rows[0] as { id: string; data_month: string } | undefined;
  if (!row) throw new Error('no_live_version');
  return { id: row.id, dataMonth: isoDate(row.data_month) };
}

function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** The version's global month-end index (sorted distinct price dates). */
async function versionDates(versionId: string): Promise<string[]> {
  const r = await db.execute(sql`
    select distinct price_date from fund_price
     where version_id = ${versionId} order by price_date
  `);
  return (r.rows as { price_date: unknown }[]).map((x) => isoDate(x.price_date));
}

/** Load aligned price series for a set of fund ids over the global index. */
async function loadSeries(
  versionId: string,
  fundIds: string[],
  dates: string[],
): Promise<Map<string, (number | null)[]>> {
  const out = new Map<string, (number | null)[]>();
  if (fundIds.length === 0) return out;
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  for (const id of fundIds) out.set(id, new Array(dates.length).fill(null));

  const r = await db.execute(sql`
    select fund_id, price_date, price
      from fund_price
     where version_id = ${versionId}
       and fund_id in (${sql.join(fundIds.map((id) => sql`${id}`), sql`, `)})
     order by fund_id, price_date
  `);
  for (const row of r.rows as { fund_id: string; price_date: unknown; price: string }[]) {
    const col = out.get(row.fund_id);
    const idx = dateIndex.get(isoDate(row.price_date));
    if (col && idx != null) col[idx] = Number(row.price);
  }
  return out;
}

// ── GET /api/funds  (list, live version) ─────────────────────
// Query: ?provider=&cls=&risk=&q=
funds.get('/', async (c) => {
  let live;
  try {
    live = await liveVersion();
  } catch {
    return c.json({ error: 'no_live_version' }, 503);
  }

  const provider = c.req.query('provider');
  const cls = c.req.query('cls'); // asset_class
  const risk = c.req.query('risk');
  const q = c.req.query('q');

  const conds = [sql`ffv.version_id = ${live.id}`];
  if (provider) conds.push(sql`p.name = ${provider}`);
  if (cls) conds.push(sql`f.asset_class = ${cls}`);
  if (risk) conds.push(sql`ffv.risk_rating = ${Number(risk)}`);
  if (q) conds.push(sql`f.name ilike ${'%' + q + '%'}`);
  conds.push(sql`f.closed_at is null`);

  const whereSql = conds.reduce((acc, cond, i) => (i === 0 ? cond : sql`${acc} and ${cond}`));

  const r = await db.execute(sql`
    select f.id, f.name, f.slug, f.asset_class, f.category,
           p.name as provider, p.colour_hex,
           ffv.risk_rating, ffv.amc_pct, ffv.ongoing_charge_pct,
           ffv.manager, ffv.style, ffv.region, ffv.risk_controlled, ffv.sfdr_article,
           fm.metrics
      from fund f
      join provider p on p.id = f.provider_id
      join fund_fact_version ffv on ffv.fund_id = f.id and ffv.version_id = ${live.id}
      left join fund_metric fm on fm.fund_id = f.id and fm.version_id = ${live.id}
     where ${whereSql}
     order by p.name, f.name
  `);

  const rows = (r.rows as Record<string, unknown>[]).map((row) => {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      provider: row.provider,
      providerColour: row.colour_hex,
      assetClass: row.asset_class,
      category: row.category,
      riskRating: row.risk_rating,
      amcPct: row.amc_pct == null ? null : Number(row.amc_pct),
      ongoingChargePct: row.ongoing_charge_pct == null ? null : Number(row.ongoing_charge_pct),
      manager: row.manager,
      style: row.style,
      region: row.region,
      riskControlled: row.risk_controlled,
      sfdrArticle: row.sfdr_article,
      // headline metrics only (keep the list payload light)
      ytd: m.ytd ?? null,
      r1: m.r1 ?? null,
      r5: m.r5 ?? null,
      vol5y: m.vol5y ?? null,
      sharpe5y: m.sharpe5y ?? null,
      monthsOfHistory: m.monthsOfHistory ?? 0,
    };
  });

  return c.json({ versionId: live.id, dataMonth: live.dataMonth, count: rows.length, funds: rows });
});

// ── GET /api/funds/suggestions?ids=a,b  (comparables) ────────
// Same asset class + nearby risk rating as the given fund(s), excluding them.
funds.get('/suggestions', async (c) => {
  let live;
  try {
    live = await liveVersion();
  } catch {
    return c.json({ error: 'no_live_version' }, 503);
  }
  const idsParam = c.req.query('ids') ?? '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return c.json({ suggestions: [] });

  const r = await db.execute(sql`
    with seed as (
      select f.asset_class, ffv.risk_rating
        from fund f
        join fund_fact_version ffv on ffv.fund_id = f.id and ffv.version_id = ${live.id}
       where f.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    )
    select distinct f.id, f.name, p.name as provider, p.colour_hex,
           f.asset_class, ffv.risk_rating
      from fund f
      join provider p on p.id = f.provider_id
      join fund_fact_version ffv on ffv.fund_id = f.id and ffv.version_id = ${live.id}
     where f.closed_at is null
       and f.id not in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
       and f.asset_class in (select asset_class from seed)
       and abs(coalesce(ffv.risk_rating, 4) - coalesce((select max(risk_rating) from seed), 4)) <= 1
     order by f.name
     limit 8
  `);

  const suggestions = (r.rows as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    name: row.name,
    provider: row.provider,
    providerColour: row.colour_hex,
    assetClass: row.asset_class,
    riskRating: row.risk_rating,
  }));
  return c.json({ suggestions });
});

// ── GET /api/funds/:id  (detail: facts + metrics + series) ───
funds.get('/:id', async (c) => {
  let live;
  try {
    live = await liveVersion();
  } catch {
    return c.json({ error: 'no_live_version' }, 503);
  }
  const id = c.req.param('id');

  const r = await db.execute(sql`
    select f.id, f.name, f.slug, f.asset_class, f.category, f.launch_date, f.closed_at,
           p.name as provider, p.colour_hex,
           ffv.risk_rating, ffv.amc_pct, ffv.ongoing_charge_pct,
           ffv.manager, ffv.style, ffv.region, ffv.risk_controlled, ffv.sfdr_article, ffv.description,
           fm.metrics
      from fund f
      join provider p on p.id = f.provider_id
      join fund_fact_version ffv on ffv.fund_id = f.id and ffv.version_id = ${live.id}
      left join fund_metric fm on fm.fund_id = f.id and fm.version_id = ${live.id}
     where f.id = ${id}
  `);
  const row = (r.rows as Record<string, unknown>[])[0];
  if (!row) return c.json({ error: 'not_found' }, 404);

  const dates = await versionDates(live.id);
  const seriesMap = await loadSeries(live.id, [id], dates);

  return c.json({
    versionId: live.id,
    dataMonth: live.dataMonth,
    fund: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      provider: row.provider,
      providerColour: row.colour_hex,
      assetClass: row.asset_class,
      category: row.category,
      launchDate: row.launch_date ? isoDate(row.launch_date) : null,
      closedAt: row.closed_at ? isoDate(row.closed_at) : null,
      riskRating: row.risk_rating,
      amcPct: row.amc_pct == null ? null : Number(row.amc_pct),
      ongoingChargePct: row.ongoing_charge_pct == null ? null : Number(row.ongoing_charge_pct),
      manager: row.manager,
      style: row.style,
      region: row.region,
      riskControlled: row.risk_controlled,
      sfdrArticle: row.sfdr_article,
      description: row.description,
      metrics: row.metrics ?? null,
    },
    dates,
    series: seriesMap.get(id) ?? [],
  });
});

// ── POST /api/funds/charts/:key/data ─────────────────────────
// (mounted under /funds for locality of fund data — URL is /api/funds/charts/:key/data)
// Body: { fundIds: string[], compareMode?: 'common'|'own' }
funds.post('/charts/:key/data', async (c) => {
  const key = c.req.param('key') as ChartKey;
  if (!CHART_KEYS.includes(key)) return c.json({ error: 'unknown_chart', key }, 400);
  const def = chartRegistry.get(key);
  if (!def) return c.json({ error: 'chart_not_implemented', key }, 501);

  let body: { fundIds?: unknown; compareMode?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_body' }, 400);
  }
  const fundIds = Array.isArray(body.fundIds)
    ? (body.fundIds as unknown[]).map(String).filter(Boolean)
    : [];
  if (fundIds.length === 0) return c.json({ error: 'no_funds' }, 400);

  const compareMode: CompareMode = COMPARE_MODES.includes(body.compareMode as CompareMode)
    ? (body.compareMode as CompareMode)
    : 'common';

  let live;
  try {
    live = await liveVersion();
  } catch {
    return c.json({ error: 'no_live_version' }, 503);
  }

  // Names (preserve requested order).
  const nameRes = await db.execute(sql`
    select id, name from fund
     where id in (${sql.join(fundIds.map((id) => sql`${id}`), sql`, `)})
  `);
  const nameById = new Map(
    (nameRes.rows as { id: string; name: string }[]).map((x) => [x.id, x.name]),
  );

  const dates = await versionDates(live.id);
  const seriesMap = await loadSeries(live.id, fundIds, dates);

  const ctxFunds = fundIds
    .filter((id) => nameById.has(id))
    .map((id) => ({
      id,
      name: nameById.get(id)!,
      series: seriesMap.get(id) ?? new Array(dates.length).fill(null),
      dates,
    }));

  // Common-window start = max first-non-null index across selected funds.
  let startIndex = 0;
  if (compareMode === 'common') {
    for (const f of ctxFunds) {
      const fi = f.series.findIndex((v) => v != null);
      if (fi > startIndex) startIndex = fi;
    }
  }

  const ctx: ChartContext = {
    versionId: live.id,
    funds: ctxFunds,
    compareMode,
    window: { startIndex },
  };

  const data = def.data(ctx);
  const facts = def.facts(data);
  return c.json({
    key,
    kind: def.kind,
    title: def.title(ctx),
    compareMode,
    dataMonth: live.dataMonth,
    data,
    facts,
    footnote: def.footnote(ctx),
  });
});