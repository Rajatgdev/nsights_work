/**
 * Portfolios API (build spec §10, §6.6/§6.7). TENANT tables — every DB op runs
 * inside withTenant() so Postgres RLS enforces firm isolation AND the
 * personal-portfolio visibility policy (owner or firm_admin only).
 *
 * Permissions (spec §1 matrix):
 *   - house portfolios: create/edit needs firm_admin OR can_edit_house_portfolios
 *   - personal portfolios: any member, owned by the creator
 * Fund prices/facts are platform-owned (no RLS) → read with plain `db`.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db, withTenant } from '@nsights/db';
import {
  analyse, profile, suggest, providerFit,
  type Approach, type HoldingInput, type CandidateFund,
} from '@nsights/portfolio';
import { PORTFOLIO_WEIGHT_TOTAL_BP } from '@nsights/shared';
import type { AppEnv, FirmMembership } from '../context';

export const portfolios = new Hono<AppEnv>();

// Every portfolio route needs a firm membership.
portfolios.use('*', async (c, next) => {
  if (!c.get('membership')) return c.json({ error: 'no_firm' }, 403);
  await next();
});

function tenantCtx(m: FirmMembership, userId: string) {
  return { firmId: m.firmId, userId, role: m.role };
}

function canEditHouse(m: FirmMembership): boolean {
  return m.role === 'firm_admin' || m.canEditHousePortfolios;
}

function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

async function liveVersion(): Promise<{ id: string; dataMonth: string }> {
  const r = await db.execute(sql`
    select dv.id, dv.data_month from platform_state ps
      join data_version dv on dv.id = ps.live_version_id where ps.id = 1
  `);
  const row = r.rows[0] as { id: string; data_month: string } | undefined;
  if (!row) throw new Error('no_live_version');
  return { id: row.id, dataMonth: isoDate(row.data_month) };
}

// ── GET /api/portfolios — list visible (RLS hides others' personal) ──
portfolios.get('/', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const rows = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const r = await tx.execute(sql`
      select p.id, p.kind, p.name, p.description, p.approach, p.rebalancing,
             p.owner_user_id, count(h.fund_id) as holdings
        from portfolio p
        left join portfolio_holding h on h.portfolio_id = p.id
       group by p.id
       order by p.kind, p.name
    `);
    return r.rows as Record<string, unknown>[];
  });
  return c.json({
    portfolios: rows.map((p) => ({
      id: p.id, kind: p.kind, name: p.name, description: p.description,
      approach: p.approach, rebalancing: p.rebalancing,
      ownerUserId: p.owner_user_id, holdings: Number(p.holdings),
    })),
  });
});

// ── POST /api/portfolios — create (house needs edit right) ──
portfolios.post('/', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }

  const kind = body.kind === 'house' ? 'house' : 'personal';
  const name = String(body.name ?? '').trim();
  if (!name) return c.json({ error: 'name_required' }, 400);
  if (kind === 'house' && !canEditHouse(m)) return c.json({ error: 'forbidden' }, 403);

  const holdings = parseHoldings(body.holdings);
  const weightError = validateWeights(holdings, { allowEmpty: true });
  if (weightError) return c.json({ error: weightError }, 400);

  const created = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const r = await tx.execute(sql`
      insert into portfolio (firm_id, owner_user_id, kind, name, description, approach, rebalancing)
      values (${m.firmId}, ${kind === 'house' ? null : user.id}, ${kind}, ${name},
              ${body.description ?? null}, ${body.approach ?? null}, ${body.rebalancing ?? 'monthly'})
      returning id
    `);
    const id = (r.rows[0] as { id: string }).id;
    await insertHoldings(tx, id, m.firmId, holdings);
    return id;
  });
  return c.json({ id: created }, 201);
});

// ── GET /api/portfolios/:id ──
portfolios.get('/:id', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  const data = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const pr = await tx.execute(sql`select * from portfolio where id = ${id}`);
    const p = pr.rows[0] as Record<string, unknown> | undefined;
    if (!p) return null;
    const hr = await tx.execute(sql`
      select fund_id, weight_bp, role from portfolio_holding where portfolio_id = ${id}
    `);
    return { p, holdings: hr.rows as Record<string, unknown>[] };
  });
  if (!data) return c.json({ error: 'not_found' }, 404);
  return c.json({
    portfolio: {
      id: data.p.id, kind: data.p.kind, name: data.p.name, description: data.p.description,
      approach: data.p.approach, rebalancing: data.p.rebalancing, ownerUserId: data.p.owner_user_id,
      holdings: data.holdings.map((h) => ({ fundId: h.fund_id, weightBp: Number(h.weight_bp), role: h.role })),
    },
  });
});

// ── PATCH /api/portfolios/:id — update meta + replace holdings ──
portfolios.patch('/:id', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }

  const holdings = body.holdings !== undefined ? parseHoldings(body.holdings) : null;
  if (holdings) {
    const err = validateWeights(holdings, { allowEmpty: false });
    if (err) return c.json({ error: err }, 400);
  }

  const result = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const pr = await tx.execute(sql`select kind from portfolio where id = ${id}`);
    const p = pr.rows[0] as { kind: string } | undefined;
    if (!p) return 'not_found' as const;
    if (p.kind === 'house' && !canEditHouse(m)) return 'forbidden' as const;

    await tx.execute(sql`
      update portfolio set
        name = coalesce(${body.name ?? null}, name),
        description = ${body.description === undefined ? sql`description` : (body.description ?? null)},
        approach = ${body.approach === undefined ? sql`approach` : (body.approach ?? null)},
        rebalancing = coalesce(${body.rebalancing ?? null}, rebalancing),
        updated_at = now()
      where id = ${id}
    `);
    if (holdings) {
      await tx.execute(sql`delete from portfolio_holding where portfolio_id = ${id}`);
      await insertHoldings(tx, id, m.firmId, holdings);
    }
    return 'ok' as const;
  });
  if (result === 'not_found') return c.json({ error: 'not_found' }, 404);
  if (result === 'forbidden') return c.json({ error: 'forbidden' }, 403);
  return c.json({ ok: true });
});

// ── DELETE /api/portfolios/:id ──
portfolios.delete('/:id', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');
  const result = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const pr = await tx.execute(sql`select kind from portfolio where id = ${id}`);
    const p = pr.rows[0] as { kind: string } | undefined;
    if (!p) return 'not_found' as const;
    if (p.kind === 'house' && !canEditHouse(m)) return 'forbidden' as const;
    await tx.execute(sql`delete from portfolio where id = ${id}`);
    return 'ok' as const;
  });
  if (result === 'not_found') return c.json({ error: 'not_found' }, 404);
  if (result === 'forbidden') return c.json({ error: 'forbidden' }, 403);
  return c.json({ ok: true });
});

// ── POST /api/portfolios/:id/analyse — blend metrics, risk class, warnings ──
portfolios.post('/:id/analyse', async (c) => {
  const m = c.get('membership')!;
  const user = c.get('user');
  const id = c.req.param('id');

  const holdingRows = await withTenant(tenantCtx(m, user.id), async (tx) => {
    const pr = await tx.execute(sql`select rebalancing from portfolio where id = ${id}`);
    const p = pr.rows[0] as { rebalancing: string } | undefined;
    if (!p) return null;
    const hr = await tx.execute(sql`select fund_id, weight_bp from portfolio_holding where portfolio_id = ${id}`);
    return { rebalancing: p.rebalancing, holdings: hr.rows as { fund_id: string; weight_bp: number }[] };
  });
  if (!holdingRows) return c.json({ error: 'not_found' }, 404);
  if (holdingRows.holdings.length === 0) return c.json({ error: 'empty_portfolio' }, 400);

  const resp = await analyseHoldings(
    holdingRows.holdings.map((h) => ({ fundId: h.fund_id, weightBp: Number(h.weight_bp) })),
    holdingRows.rebalancing as 'monthly' | 'buy-and-hold',
  );
  return c.json(resp);
});

// ── POST /api/portfolios/analyse — ad-hoc (builder, before save) ──
portfolios.post('/analyse', async (c) => {
  let body: { holdings?: unknown; rebalancing?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }
  const holdings = parseHoldings(body.holdings);
  if (holdings.length === 0) return c.json({ error: 'empty_portfolio' }, 400);
  const err = validateWeights(holdings, { allowEmpty: false });
  if (err) return c.json({ error: err }, 400);
  const resp = await analyseHoldings(
    holdings.map((h) => ({ fundId: h.fundId, weightBp: h.weightBp })),
    body.rebalancing === 'buy-and-hold' ? 'buy-and-hold' : 'monthly',
  );
  return c.json(resp);
});

// ── POST /api/portfolios/suggest — rules engine ──
portfolios.post('/suggest', async (c) => {
  let body: { approach?: unknown; holdings?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_body' }, 400); }
  const approach = (['core-satellite', 'equal-weighted', 'multi-manager', 'multi-strategy'] as const)
    .includes(body.approach as Approach) ? (body.approach as Approach) : 'core-satellite';
  const holdings = parseHoldings(body.holdings);

  let live;
  try { live = await liveVersion(); } catch { return c.json({ error: 'no_live_version' }, 503); }

  // Load facts for held funds + the full universe (platform data, no RLS).
  const facts = await loadFacts(live.id);
  const heldInputs: HoldingInput[] = holdings.map((h) => {
    const f = facts.get(h.fundId);
    return {
      fundId: h.fundId, weightBp: h.weightBp,
      name: f?.name ?? h.fundId, provider: f?.provider ?? '', assetClass: f?.assetClass ?? 'Multi-Asset',
      riskRating: f?.riskRating ?? 4, manager: f?.manager, style: f?.style, sfdrArticle: f?.sfdrArticle,
    };
  });
  const universe: CandidateFund[] = [...facts.values()].map((f) => ({
    fundId: f.fundId, name: f.name, provider: f.provider, assetClass: f.assetClass,
    riskRating: f.riskRating ?? 4, manager: f.manager, style: f.style, sfdrArticle: f.sfdrArticle,
  }));

  return c.json({
    suggestions: suggest(approach, heldInputs, universe),
    fit: providerFit(approach, heldInputs),
  });
});

// ── helpers ──────────────────────────────────────────────────

interface ParsedHolding { fundId: string; weightBp: number; role?: string | null }

function parseHoldings(raw: unknown): ParsedHolding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h): ParsedHolding | null => {
      const o = h as Record<string, unknown>;
      const fundId = String(o.fundId ?? '');
      const weightBp = Math.round(Number(o.weightBp ?? 0));
      if (!fundId || !Number.isFinite(weightBp)) return null;
      return { fundId, weightBp, role: (o.role as string | undefined) ?? null };
    })
    .filter((x): x is ParsedHolding => x !== null);
}

function validateWeights(holdings: ParsedHolding[], opts: { allowEmpty: boolean }): string | null {
  if (holdings.length === 0) return opts.allowEmpty ? null : 'empty_portfolio';
  if (holdings.some((h) => h.weightBp <= 0)) return 'weight_must_be_positive';
  const total = holdings.reduce((a, h) => a + h.weightBp, 0);
  if (total !== PORTFOLIO_WEIGHT_TOTAL_BP) return `weights_must_sum_to_${PORTFOLIO_WEIGHT_TOTAL_BP}`;
  const ids = new Set(holdings.map((h) => h.fundId));
  if (ids.size !== holdings.length) return 'duplicate_fund';
  return null;
}

async function insertHoldings(
  tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  portfolioId: string,
  firmId: string,
  holdings: ParsedHolding[],
): Promise<void> {
  for (const h of holdings) {
    await tx.execute(sql`
      insert into portfolio_holding (portfolio_id, firm_id, fund_id, weight_bp, role)
      values (${portfolioId}, ${firmId}, ${h.fundId}, ${h.weightBp}, ${h.role ?? null})
    `);
  }
}

interface FundFacts {
  fundId: string; name: string; provider: string; assetClass: string;
  riskRating: number | null; amcPct: number | null; ongoingChargePct: number | null;
  manager: string | null; style: string | null; sfdrArticle: number | null;
}

async function loadFacts(versionId: string): Promise<Map<string, FundFacts>> {
  const r = await db.execute(sql`
    select f.id, f.name, f.asset_class, p.name as provider,
           ffv.risk_rating, ffv.amc_pct, ffv.ongoing_charge_pct, ffv.manager, ffv.style, ffv.sfdr_article
      from fund f
      join provider p on p.id = f.provider_id
      left join fund_fact_version ffv on ffv.fund_id = f.id and ffv.version_id = ${versionId}
     where f.closed_at is null
  `);
  const out = new Map<string, FundFacts>();
  for (const row of r.rows as Record<string, unknown>[]) {
    out.set(row.id as string, {
      fundId: row.id as string, name: row.name as string, provider: row.provider as string,
      assetClass: row.asset_class as string,
      riskRating: row.risk_rating == null ? null : Number(row.risk_rating),
      amcPct: row.amc_pct == null ? null : Number(row.amc_pct),
      ongoingChargePct: row.ongoing_charge_pct == null ? null : Number(row.ongoing_charge_pct),
      manager: (row.manager as string) ?? null, style: (row.style as string) ?? null,
      sfdrArticle: row.sfdr_article == null ? null : Number(row.sfdr_article),
    });
  }
  return out;
}

/** Load series + facts for the held funds and run analyse(). */
async function analyseHoldings(
  holdings: { fundId: string; weightBp: number }[],
  rebalancing: 'monthly' | 'buy-and-hold',
) {
  const live = await liveVersion();
  const facts = await loadFacts(live.id);

  // global month index
  const dr = await db.execute(sql`
    select distinct price_date from fund_price where version_id = ${live.id} order by price_date
  `);
  const dates = (dr.rows as { price_date: unknown }[]).map((x) => isoDate(x.price_date));
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  // aligned series per held fund
  const ids = holdings.map((h) => h.fundId);
  const seriesMap = new Map<string, (number | null)[]>();
  for (const id of ids) seriesMap.set(id, new Array(dates.length).fill(null));
  if (ids.length) {
    const pr = await db.execute(sql`
      select fund_id, price_date, price from fund_price
       where version_id = ${live.id}
         and fund_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);
    for (const row of pr.rows as { fund_id: string; price_date: unknown; price: string }[]) {
      const col = seriesMap.get(row.fund_id);
      const idx = dateIndex.get(isoDate(row.price_date));
      if (col && idx != null) col[idx] = Number(row.price);
    }
  }

  const inputs: HoldingInput[] = holdings.map((h) => {
    const f = facts.get(h.fundId);
    return {
      fundId: h.fundId, weightBp: h.weightBp,
      name: f?.name ?? h.fundId, provider: f?.provider ?? '', assetClass: f?.assetClass ?? 'Multi-Asset',
      riskRating: f?.riskRating ?? 4, manager: f?.manager, style: f?.style, sfdrArticle: f?.sfdrArticle,
      series: seriesMap.get(h.fundId) ?? [],
    };
  });

  const result = analyse({ holdings: inputs, dates, rebalancing });
  return {
    dataMonth: live.dataMonth,
    structure: result.structure,
    riskLabel: result.riskLabel,
    averageFundRisk: result.averageFundRisk,
    indicativeRiskClass: result.indicativeRiskClass,
    warnings: result.warnings,
    historyLimitedBy: result.historyLimitedBy,
    metrics: result.metrics,
    dates,
    blendSeries: result.blendSeries,
  };
}
