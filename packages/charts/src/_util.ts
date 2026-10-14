/**
 * Shared chart helpers: windowing (common vs own), colour assignment, rounding,
 * and the default screen theme. Pure.
 */
import { PROVIDER_COLOURS } from '@nsights/shared';
import type { ChartContext, ChartTheme } from './registry.js';

/** 8-colour series palette (spec §7) for when provider colour isn't the axis. */
export const SERIES_PALETTE = [
  '#1f64c4', // zurich blue
  '#16a394', // irish life teal
  '#caa023', // aviva gold
  '#2e8b57', // new ireland green
  '#6a4fb3', // royal london purple
  '#2a4a73', // standard life navy
  '#c2552e', // terracotta
  '#4a7c59', // sage
];

/** Default on-screen theme (deck themes override later in @nsights/export). */
export const DEFAULT_THEME: ChartTheme = {
  palette: SERIES_PALETTE,
  textColor: '#15241f',
  gridColor: 'rgba(21,36,31,.10)',
};

/** Round to n decimals (null-safe). */
export function round(v: number | null | undefined, n = 2): number | null {
  if (v == null || Number.isNaN(v)) return null;
  const f = 10 ** n;
  return Math.round(v * f) / f;
}

/** As a percentage with n decimals (0.0705 → 7.05). null-safe. */
export function pct(v: number | null | undefined, n = 2): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return round(v * 100, n);
}

export interface WindowedFund {
  id: string;
  name: string;
  colour: string;
  /** series sliced to the active window (common → from startIndex; own → full). */
  series: (number | null)[];
  dates: string[];
}

/**
 * Apply compare-mode windowing and assign a stable colour per fund.
 * common → every fund sliced from the shared start index (max first-non-null).
 * own    → each fund keeps its full series; dates are the global index.
 */
export function windowed(ctx: ChartContext): { funds: WindowedFund[]; dates: string[] } {
  const start = ctx.compareMode === 'common' ? (ctx.window?.startIndex ?? 0) : 0;
  const dates = ctx.funds[0]?.dates.slice(start) ?? [];
  const funds = ctx.funds.map((f, i) => ({
    id: f.id,
    name: f.name,
    colour: colourFor(f.name, i),
    series: f.series.slice(start),
    dates: f.dates.slice(start),
  }));
  return { funds, dates };
}

/** Provider colour if the fund name starts with a known provider, else palette. */
export function colourFor(fundName: string, index: number): string {
  for (const [provider, colour] of Object.entries(PROVIDER_COLOURS)) {
    if (fundName.toLowerCase().startsWith(provider.toLowerCase())) return colour;
  }
  return SERIES_PALETTE[index % SERIES_PALETTE.length]!;
}

/** Window label for footnotes, e.g. "common window from Jun 2016" or "full history". */
export function windowLabel(ctx: ChartContext): string {
  if (ctx.compareMode === 'own') return 'own full history';
  const start = ctx.window?.startIndex ?? 0;
  const d = ctx.funds[0]?.dates[start];
  if (!d) return 'common window';
  const dt = new Date(d);
  const mon = dt.toLocaleString('en-IE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `common window from ${mon}`;
}