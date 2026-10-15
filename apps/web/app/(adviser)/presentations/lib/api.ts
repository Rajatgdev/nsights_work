/**
 * Typed client for the Presentations API (same-origin, session cookie).
 */
export type SlideKind = 'cover' | 'chart' | 'summary' | 'portfolio' | 'team' | 'philosophy' | 'strategy' | 'disclaimer';
export type TemplateId = 'boardroom' | 'editorial' | 'monoline';
export type CompareMode = 'common' | 'own';

export interface PresentationListItem {
  id: string;
  title: string;
  clientName: string | null;
  adviserName: string | null;
  templateId: TemplateId;
  compareMode: CompareMode;
  status: 'draft' | 'final';
  slides: number;
}

export interface Slide {
  id: string;
  position: number;
  kind: SlideKind;
  chartKey: string | null;
  fundIds: string[];
  portfolioId: string | null;
  options: unknown;
  commentaryEnabled: boolean;
  commentaryText: string | null;
  commentaryEdited: boolean;
}

export interface PresentationDetail {
  id: string;
  title: string;
  clientName: string | null;
  adviserName: string | null;
  dataVersionId: string;
  templateId: TemplateId;
  paletteId: string;
  compareMode: CompareMode;
  status: 'draft' | 'final';
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
const JSONH = { 'Content-Type': 'application/json' };

export function listPresentations(): Promise<{ presentations: PresentationListItem[] }> {
  return j('/api/presentations');
}
export function createPresentation(body: { title: string; clientName?: string; adviserName?: string; templateId?: TemplateId; compareMode?: CompareMode }): Promise<{ id: string }> {
  return j('/api/presentations', { method: 'POST', headers: JSONH, body: JSON.stringify(body) });
}
export function getPresentation(id: string): Promise<{ presentation: PresentationDetail; slides: Slide[] }> {
  return j(`/api/presentations/${id}`);
}
export function updatePresentation(id: string, body: Partial<{ title: string; clientName: string | null; adviserName: string | null; templateId: TemplateId; compareMode: CompareMode; status: 'draft' | 'final' }>): Promise<{ ok: boolean }> {
  return j(`/api/presentations/${id}`, { method: 'PATCH', headers: JSONH, body: JSON.stringify(body) });
}
export function deletePresentation(id: string): Promise<{ ok: boolean }> {
  return j(`/api/presentations/${id}`, { method: 'DELETE' });
}
export function addSlide(id: string, body: { kind: SlideKind; chartKey?: string; fundIds?: string[]; portfolioId?: string }): Promise<{ id: string }> {
  return j(`/api/presentations/${id}/slides`, { method: 'POST', headers: JSONH, body: JSON.stringify(body) });
}
export function updateSlide(slideId: string, body: Partial<{ chartKey: string | null; fundIds: string[]; portfolioId: string | null; commentaryEnabled: boolean; commentaryText: string | null }>): Promise<{ ok: boolean }> {
  return j(`/api/presentations/slides/${slideId}`, { method: 'PATCH', headers: JSONH, body: JSON.stringify(body) });
}
export function deleteSlide(slideId: string): Promise<{ ok: boolean }> {
  return j(`/api/presentations/slides/${slideId}`, { method: 'DELETE' });
}
export function reorderSlides(id: string, slideIds: string[]): Promise<{ ok: boolean }> {
  return j(`/api/presentations/${id}/reorder`, { method: 'POST', headers: JSONH, body: JSON.stringify({ slideIds }) });
}
export function generateCommentary(slideId: string): Promise<{ text: string; model: string }> {
  return j(`/api/presentations/slides/${slideId}/commentary/generate`, { method: 'POST' });
}

// chart data (reused from the funds endpoint)
export interface ChartPayload {
  key: string; kind: 'line' | 'bar' | 'unitbox' | 'scatter' | 'table';
  title: string; compareMode: CompareMode; dataMonth: string;
  data: unknown; facts: Record<string, number | string>; footnote: string;
}
export function getChartData(key: string, fundIds: string[], compareMode: CompareMode): Promise<ChartPayload> {
  return j(`/api/funds/charts/${key}/data`, { method: 'POST', headers: JSONH, body: JSON.stringify({ fundIds, compareMode }) });
}

export interface FundPick { id: string; name: string; provider: string; providerColour: string | null; assetClass: string; riskRating: number | null }
export function listFundsForPicker(q?: string, provider?: string): Promise<{ funds: FundPick[] }> {
  const p = new URLSearchParams();
  if (q) p.set('q', q); if (provider) p.set('provider', provider);
  const qs = p.toString();
  return j<{ funds: Record<string, unknown>[] }>(`/api/funds${qs ? `?${qs}` : ''}`).then((r) => ({
    funds: r.funds.map((f) => ({
      id: f.id as string, name: f.name as string, provider: f.provider as string,
      providerColour: (f.providerColour as string) ?? null, assetClass: f.assetClass as string,
      riskRating: f.riskRating == null ? null : Number(f.riskRating),
    })),
  }));
}

export const CHART_SLIDE_KEYS = [
  'growth10k', 'cumulative5y', 'annualised', 'calendarYear', 'discreteAnnual',
  'rolling2y', 'historicVol', 'stressDrawdown', 'histMonthly', 'histQuarterly',
  'riskReturn', 'charges', 'keyMetrics', 'comparisonSummary',
] as const;

// ── Portfolios (reused for the portfolio slide) ──
export interface PortfolioPick { id: string; kind: 'house' | 'personal'; name: string; holdings: number }
export function listPortfoliosForSlide(): Promise<{ portfolios: PortfolioPick[] }> {
  return j<{ portfolios: Record<string, unknown>[] }>('/api/portfolios').then((r) => ({
    portfolios: r.portfolios.map((p) => ({
      id: p.id as string, kind: p.kind as 'house' | 'personal', name: p.name as string, holdings: Number(p.holdings),
    })),
  }));
}

export interface PortfolioAnalysis {
  dataMonth: string; structure: string; riskLabel: string; averageFundRisk: number;
  indicativeRiskClass: number | null; warnings: { code: string; message: string }[];
  historyLimitedBy: { fundId: string; name: string; startDate: string | null } | null;
  metrics: Record<string, unknown>; dates: string[]; blendSeries: (number | null)[];
}
export function analysePortfolio(portfolioId: string): Promise<PortfolioAnalysis> {
  return j(`/api/portfolios/${portfolioId}/analyse`, { method: 'POST' });
}
export interface PortfolioHolding { fundId: string; weightBp: number; role?: string | null }
export function getPortfolioHoldings(portfolioId: string): Promise<{ portfolio: { name: string; holdings: PortfolioHolding[] } }> {
  return j(`/api/portfolios/${portfolioId}`);
}
