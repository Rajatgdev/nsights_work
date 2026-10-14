/**
 * Typed client for the Portfolios API (same-origin, session cookie).
 */

export type Approach = 'core-satellite' | 'equal-weighted' | 'multi-manager' | 'multi-strategy';
export type Rebalancing = 'monthly' | 'buy-and-hold';
export type Kind = 'house' | 'personal';

export interface PortfolioListItem {
  id: string;
  kind: Kind;
  name: string;
  description: string | null;
  approach: Approach | null;
  rebalancing: Rebalancing;
  ownerUserId: string | null;
  holdings: number;
}

export interface HoldingInput {
  fundId: string;
  weightBp: number;
  role?: string | null;
}

export interface PortfolioDetail {
  id: string;
  kind: Kind;
  name: string;
  description: string | null;
  approach: Approach | null;
  rebalancing: Rebalancing;
  ownerUserId: string | null;
  holdings: HoldingInput[];
}

export interface Warning {
  code: string;
  message: string;
}

export interface AnalyseResponse {
  dataMonth: string;
  structure: string;
  riskLabel: string;
  averageFundRisk: number;
  indicativeRiskClass: number | null;
  warnings: Warning[];
  historyLimitedBy: { fundId: string; name: string; startDate: string | null } | null;
  metrics: Record<string, unknown>;
  dates: string[];
  blendSeries: (number | null)[];
}

export interface Suggestion {
  fundId: string;
  name: string;
  provider: string;
  assetClass: string;
  riskRating: number;
  score: number;
  reason: string;
}

export interface SuggestResponse {
  suggestions: Suggestion[];
  fit: { ok: boolean; message: string };
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export function listPortfolios(): Promise<{ portfolios: PortfolioListItem[] }> {
  return j('/api/portfolios');
}

export function getPortfolio(id: string): Promise<{ portfolio: PortfolioDetail }> {
  return j(`/api/portfolios/${id}`);
}

export function createPortfolio(body: {
  kind: Kind; name: string; description?: string; approach?: Approach;
  rebalancing?: Rebalancing; holdings: HoldingInput[];
}): Promise<{ id: string }> {
  return j('/api/portfolios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function updatePortfolio(id: string, body: Partial<{
  name: string; description: string | null; approach: Approach | null;
  rebalancing: Rebalancing; holdings: HoldingInput[];
}>): Promise<{ ok: boolean }> {
  return j(`/api/portfolios/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function deletePortfolio(id: string): Promise<{ ok: boolean }> {
  return j(`/api/portfolios/${id}`, { method: 'DELETE' });
}

export function analyseAdhoc(holdings: HoldingInput[], rebalancing: Rebalancing): Promise<AnalyseResponse> {
  return j('/api/portfolios/analyse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holdings, rebalancing }) });
}

export function suggestFunds(approach: Approach, holdings: HoldingInput[]): Promise<SuggestResponse> {
  return j('/api/portfolios/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approach, holdings }) });
}

// ── fund picker reuses the funds list endpoint ──
export interface FundPick {
  id: string;
  name: string;
  provider: string;
  providerColour: string | null;
  assetClass: string;
  riskRating: number | null;
}

export function listFundsForPicker(q?: string, provider?: string): Promise<{ funds: FundPick[] }> {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (provider) p.set('provider', provider);
  const qs = p.toString();
  return j(`/api/funds${qs ? `?${qs}` : ''}`).then((r: unknown) => {
    const funds = (r as { funds: Record<string, unknown>[] }).funds.map((f) => ({
      id: f.id as string, name: f.name as string, provider: f.provider as string,
      providerColour: (f.providerColour as string) ?? null, assetClass: f.assetClass as string,
      riskRating: f.riskRating == null ? null : Number(f.riskRating),
    }));
    return { funds };
  });
}
