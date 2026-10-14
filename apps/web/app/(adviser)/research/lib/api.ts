/**
 * Typed client for the Research API (same-origin, session cookie). Thin fetch
 * wrappers around the §10 endpoints the server already serves.
 */

export interface FundListItem {
  id: string;
  name: string;
  slug: string;
  provider: string;
  providerColour: string | null;
  assetClass: string;
  category: string | null;
  riskRating: number | null;
  amcPct: number | null;
  ongoingChargePct: number | null;
  manager: string | null;
  style: string | null;
  region: string | null;
  riskControlled: boolean | null;
  sfdrArticle: number | null;
  ytd: number | null;
  r1: number | null;
  r5: number | null;
  vol5y: number | null;
  sharpe5y: number | null;
  monthsOfHistory: number;
}

export interface FundListResponse {
  versionId: string;
  dataMonth: string;
  count: number;
  funds: FundListItem[];
}

export interface FundDetail {
  id: string;
  name: string;
  slug: string;
  provider: string;
  providerColour: string | null;
  assetClass: string;
  category: string | null;
  launchDate: string | null;
  closedAt: string | null;
  riskRating: number | null;
  amcPct: number | null;
  ongoingChargePct: number | null;
  manager: string | null;
  style: string | null;
  region: string | null;
  riskControlled: boolean | null;
  sfdrArticle: number | null;
  description: string | null;
  metrics: Record<string, unknown> | null;
}

export interface FundDetailResponse {
  versionId: string;
  dataMonth: string;
  fund: FundDetail;
  dates: string[];
  series: (number | null)[];
}

export interface Suggestion {
  id: string;
  name: string;
  provider: string;
  providerColour: string | null;
  assetClass: string;
  riskRating: number | null;
}

export interface ChartPayload {
  key: string;
  kind: 'line' | 'bar' | 'unitbox' | 'scatter' | 'table';
  title: string;
  compareMode: 'common' | 'own';
  dataMonth: string;
  data: unknown;
  facts: Record<string, number | string>;
  footnote: string;
}

export type CompareMode = 'common' | 'own';

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new ApiError(r.status, await safeMsg(r));
  return r.json() as Promise<T>;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, await safeMsg(r));
  return r.json() as Promise<T>;
}

async function safeMsg(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: string };
    return j.error ?? r.statusText;
  } catch {
    return r.statusText;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export interface FundFilters {
  provider?: string;
  cls?: string;
  risk?: number;
  q?: string;
}

export function listFunds(f: FundFilters): Promise<FundListResponse> {
  const p = new URLSearchParams();
  if (f.provider) p.set('provider', f.provider);
  if (f.cls) p.set('cls', f.cls);
  if (f.risk != null) p.set('risk', String(f.risk));
  if (f.q) p.set('q', f.q);
  const qs = p.toString();
  return getJSON(`/api/funds${qs ? `?${qs}` : ''}`);
}

export function getFund(id: string): Promise<FundDetailResponse> {
  return getJSON(`/api/funds/${id}`);
}

export function getSuggestions(ids: string[]): Promise<{ suggestions: Suggestion[] }> {
  return getJSON(`/api/funds/suggestions?ids=${ids.join(',')}`);
}

export function getChart(
  key: string,
  fundIds: string[],
  compareMode: CompareMode,
): Promise<ChartPayload> {
  return postJSON(`/api/funds/charts/${key}/data`, { fundIds, compareMode });
}
