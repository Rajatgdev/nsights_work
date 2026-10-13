/**
 * Shared constants — single source of truth for calc, charts, db seed.
 * Values come from the build spec (§5, §6, §7).
 */

// ── Roles & tenancy ──────────────────────────────────────────
export const PLATFORM_ROLE = 'platform_admin' as const;
export const FIRM_ROLES = ['firm_admin', 'adviser', 'assistant'] as const;
export type FirmRole = (typeof FIRM_ROLES)[number];

export const FIRM_STATUSES = [
  'onboarding',
  'trial',
  'active',
  'past_due',
  'paused',
  'cancelled',
] as const;
export type FirmStatus = (typeof FIRM_STATUSES)[number];

export const MAX_FIRM_ADMINS = 2;

// ── Fund taxonomy ────────────────────────────────────────────
export const ASSET_CLASSES = ['Equity', 'Multi-Asset', 'Bond', 'Property', 'Cash'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const SFDR_ARTICLES = [6, 8, 9] as const;

// Provider brand colours (spec §7)
export const PROVIDER_COLOURS: Record<string, string> = {
  Zurich: '#1f64c4',
  'New Ireland': '#2e8b57',
  'Irish Life': '#16a394',
  Aviva: '#caa023',
  'Standard Life': '#2a4a73',
  'Royal London': '#6a4fb3',
};

// ── Calc: volatility basis (spec §6.1) ───────────────────────
// DECISION/OPEN: sample stdev (N-1). Flag to flip to population if Kaben confirms.
export const VOL_STDEV_BASIS: 'sample' | 'population' = 'sample';
export const SHARPE_RISK_FREE_RATE = 0; // OPEN — annualised, default 0

// Annualised return windows (months)
export const ANNUALISED_WINDOWS_MONTHS = [36, 60, 84, 120] as const;

// ── Validation thresholds (spec §5.3) ────────────────────────
export const MOM_MOVE_ERROR_PCT = 30; // block publish
export const MOM_MOVE_WARN_PCT = 12; // warn
export const HISTORICAL_CHANGE_ERROR_PCT = 0.5; // changed historical price w/o "correction"
export const STALE_REPEAT_MONTHS = 3;

// ── Histogram buckets (spec §6.5) ────────────────────────────
// Monthly return buckets (% thresholds, upper-exclusive except last)
export const HIST_MONTHLY_BUCKETS = [
  { label: '< -4%', min: -Infinity, max: -4 },
  { label: '-4 to -2%', min: -4, max: -2 },
  { label: '-2 to 0%', min: -2, max: 0 },
  { label: '0 to 2%', min: 0, max: 2 },
  { label: '2 to 4%', min: 2, max: 4 },
  { label: '>= 4%', min: 4, max: Infinity },
] as const;

export const HIST_QUARTERLY_BUCKETS = [
  { label: '< -8%', min: -Infinity, max: -8 },
  { label: '-8 to -4%', min: -8, max: -4 },
  { label: '-4 to 0%', min: -4, max: 0 },
  { label: '0 to 4%', min: 0, max: 4 },
  { label: '4 to 8%', min: 4, max: 8 },
  { label: '>= 8%', min: 8, max: Infinity },
] as const;

// ── Portfolio risk bands (spec §6.6) ─────────────────────────
// Indicative risk class from blended annualised vol %. NOT a PRIIPs SRI.
export const RISK_VOL_BANDS: { class: number; maxVolPct: number }[] = [
  { class: 1, maxVolPct: 0.5 },
  { class: 2, maxVolPct: 2 },
  { class: 3, maxVolPct: 5 },
  { class: 4, maxVolPct: 10 },
  { class: 5, maxVolPct: 15 },
  { class: 6, maxVolPct: 25 },
  { class: 7, maxVolPct: Infinity },
];

export const PORTFOLIO_WEIGHT_TOTAL_BP = 10_000; // basis points must sum to this

// ── Stress events (spec §6.4) — platform-admin editable later ─
export const STRESS_EVENTS = [
  { id: 'tradewar', label: 'Trade-war sell-off 2018', start: '2018-08-31', end: '2018-12-31' },
  { id: 'covid', label: 'Covid crash 2020', start: '2020-01-31', end: '2020-03-31' },
  { id: 'inflation', label: 'Inflation & rate hikes 2022', start: '2021-12-31', end: '2022-10-31' },
  { id: 'tariff', label: 'Tariff shock 2025', start: '2025-01-31', end: '2025-04-30' },
] as const;

// ── Charts launch set (spec §7) ──────────────────────────────
export const CHART_KEYS = [
  'growth10k',
  'cumulative5y',
  'annualised',
  'calendarYear',
  'discreteAnnual',
  'rolling2y',
  'historicVol',
  'stressDrawdown',
  'histMonthly',
  'histQuarterly',
  'riskReturn',
  'charges',
  'keyMetrics',
  'comparisonSummary',
] as const;
export type ChartKey = (typeof CHART_KEYS)[number];

// ── Deck templates (spec §9) ─────────────────────────────────
export const TEMPLATE_IDS = ['boardroom', 'editorial', 'monoline'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const COMPARE_MODES = ['common', 'own'] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

// Locked minimum disclaimer (spec §9, §14)
export const LOCKED_DISCLAIMER =
  'Past performance is not a reliable indicator of future results.';

// Commentary banned phrases (spec §8.4)
export const COMMENTARY_BANNED_PHRASES = [
  'guarantee',
  'will outperform',
  'recommend',
  'should invest',
  'safe',
  'risk-free',
];
export const COMMENTARY_MAX_CHARS = 450;
