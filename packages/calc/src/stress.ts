/**
 * Stress-event drawdown (build spec §6.4).
 *
 * For a window [start, end] (month-end ISO dates), computes the drawdown =
 * min over t in window of P_t / (running max from window start) - 1.
 * Also reports recovery: first month after the trough where price >= the
 * window-start price. Reported "from start" and "from trough".
 */
import type { DatedSeries } from './calendar.js';

export interface StressResult {
  id: string;
  label: string;
  drawdown: number | null; // negative; worst point in window vs running peak
  troughDate: string | null;
  recoveryMonthsFromStart: number | null; // months from window start to recovery
  recoveryMonthsFromTrough: number | null;
}

export interface StressEventDef {
  id: string;
  label: string;
  start: string; // month-end ISO
  end: string;
}

function indexOnOrAfter(dates: string[], iso: string): number {
  for (let i = 0; i < dates.length; i++) if (dates[i]! >= iso) return i;
  return -1;
}
function indexOnOrBefore(dates: string[], iso: string): number {
  for (let i = dates.length - 1; i >= 0; i--) if (dates[i]! <= iso) return i;
  return -1;
}

export function stressDrawdown(ds: DatedSeries, ev: StressEventDef): StressResult {
  const startIdx = indexOnOrAfter(ds.dates, ev.start);
  const endIdx = indexOnOrBefore(ds.dates, ev.end);
  const base: StressResult = {
    id: ev.id,
    label: ev.label,
    drawdown: null,
    troughDate: null,
    recoveryMonthsFromStart: null,
    recoveryMonthsFromTrough: null,
  };
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return base;

  const startPrice = ds.series[startIdx];
  if (startPrice == null) return base;

  let peak = startPrice;
  let worst = 0;
  let troughIdx = startIdx;
  for (let t = startIdx; t <= endIdx; t++) {
    const p = ds.series[t];
    if (p == null) continue;
    if (p > peak) peak = p;
    const dd = p / peak - 1;
    if (dd < worst) {
      worst = dd;
      troughIdx = t;
    }
  }

  // Recovery: first t after trough where price >= window-start price.
  let recoveryIdx: number | null = null;
  for (let t = troughIdx + 1; t < ds.series.length; t++) {
    const p = ds.series[t];
    if (p != null && p >= startPrice) {
      recoveryIdx = t;
      break;
    }
  }

  return {
    id: ev.id,
    label: ev.label,
    drawdown: worst,
    troughDate: ds.dates[troughIdx] ?? null,
    recoveryMonthsFromStart: recoveryIdx == null ? null : recoveryIdx - startIdx,
    recoveryMonthsFromTrough: recoveryIdx == null ? null : recoveryIdx - troughIdx,
  };
}