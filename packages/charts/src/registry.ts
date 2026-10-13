/**
 * Chart registry contract (spec §7). One entry per chart; the same `option`
 * builder feeds the on-screen ECharts instance and the SSR export path, so
 * screen and deck stay pixel-identical.
 *
 * Launch set = 14 keys (CHART_KEYS in @nsights/shared). Each ChartDef is added
 * in milestone 3; this file defines the shape and the (currently empty)
 * registry map so call sites can be wired now.
 */
import type { ChartKey, CompareMode } from '@nsights/shared';

export interface ChartContext {
  versionId: string;
  funds: { id: string; name: string; series: (number | null)[]; dates: string[] }[];
  portfolio?: { series: (number | null)[]; dates: string[] };
  compareMode: CompareMode;
  /** Common-window start index (max first-index across funds), when compareMode='common'. */
  window?: { startIndex: number };
}

export type ChartData = Record<string, unknown>;

/** Minimal theme token shape; filled by @nsights/export theme tokens. */
export interface ChartTheme {
  palette: string[];
  textColor: string;
  gridColor: string;
}

export interface ChartDef {
  key: ChartKey;
  kind: 'line' | 'bar' | 'unitbox' | 'scatter' | 'table';
  title: (ctx: ChartContext) => string;
  data: (ctx: ChartContext) => ChartData;
  /** ECharts option (for line/bar/scatter) or a TableSpec (for table kinds). */
  option: (data: ChartData, theme: ChartTheme) => unknown;
  /** Native PPTX chart spec where supported, else 'image' (PNG fallback). */
  pptx: (data: ChartData, theme: ChartTheme) => unknown | 'image';
  /** Rounded facts fed to AI commentary + the numbers validator. */
  facts: (data: ChartData) => Record<string, number | string>;
  /** Deterministic fallback sentence when AI commentary fails validation. */
  fallback: (facts: Record<string, number | string>) => string;
  footnote: (ctx: ChartContext) => string;
}

export const chartRegistry = new Map<ChartKey, ChartDef>();

export function registerChart(def: ChartDef): void {
  chartRegistry.set(def.key, def);
}

export function getChart(key: ChartKey): ChartDef | undefined {
  return chartRegistry.get(key);
}
