/**
 * Core calculation primitives (build spec §6.1).
 *
 * Conventions:
 *  - `series` is aligned to a global month-end index; null = no price that month.
 *  - f = first non-null index, n = last non-null index.
 *  - Prices are month-end valuations.
 *  - Volatility uses SAMPLE stdev (N-1) per spec DECISION (configurable).
 *
 * All functions are pure, no I/O.
 */
import { VOL_STDEV_BASIS, SHARPE_RISK_FREE_RATE } from '@nsights/shared';

export type Series = (number | null)[];

export function firstIndex(series: Series): number {
  return series.findIndex((v) => v != null);
}

export function lastIndex(series: Series): number {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] != null) return i;
  }
  return -1;
}

/** Monthly simple returns between consecutive non-null prices. Length = series.length-1, null where a gap. */
export function monthlyReturns(series: Series): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    out.push(prev != null && cur != null && prev !== 0 ? cur / prev - 1 : null);
  }
  return out;
}

/** Total return over m months ending at n: P_n / P_{n-m} - 1. null if out of history. */
export function totalReturn(series: Series, m: number): number | null {
  const n = lastIndex(series);
  const f = firstIndex(series);
  if (n < 0 || n - m < f || n - m < 0) return null;
  const pn = series[n];
  const pStart = series[n - m];
  if (pn == null || pStart == null || pStart === 0) return null;
  return pn / pStart - 1;
}

/** Annualised return over m months. null if out of history. */
export function annualised(series: Series, m: number): number | null {
  const n = lastIndex(series);
  const f = firstIndex(series);
  if (n < 0 || n - m < f || n - m < 0) return null;
  const pn = series[n];
  const pStart = series[n - m];
  if (pn == null || pStart == null || pStart === 0) return null;
  return Math.pow(pn / pStart, 12 / m) - 1;
}

/** Since-launch annualised; total return if < 12 months of history. */
export function sinceLaunchAnnualised(series: Series): number | null {
  const n = lastIndex(series);
  const f = firstIndex(series);
  if (n < 0 || f < 0 || n === f) return null;
  const months = n - f;
  const pn = series[n];
  const pf = series[f];
  if (pn == null || pf == null || pf === 0) return null;
  if (months < 12) return pn / pf - 1;
  return Math.pow(pn / pf, 12 / months) - 1;
}

/**
 * Sample (N-1) or population (N) standard deviation of a numeric array.
 * Basis chosen by VOL_STDEV_BASIS.
 */
export function stdev(values: number[], basis = VOL_STDEV_BASIS): number {
  const n = values.length;
  if (n === 0) return NaN;
  const denom = basis === 'sample' ? n - 1 : n;
  if (denom <= 0) return NaN;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / denom;
  return Math.sqrt(variance);
}

/** Annualised volatility over a window of the last `windowMonths` returns. */
export function volatility(series: Series, windowMonths?: number): number | null {
  const rets = monthlyReturns(series).filter((r): r is number => r != null);
  const slice = windowMonths != null ? rets.slice(-windowMonths) : rets;
  if (slice.length < 2) return null;
  return stdev(slice) * Math.sqrt(12);
}

/** Max drawdown over a window (trailing `windowMonths` prices, or full). Negative number. */
export function maxDrawdown(series: Series, windowMonths?: number): number | null {
  const prices = series.filter((p): p is number => p != null);
  const slice = windowMonths != null ? prices.slice(-(windowMonths + 1)) : prices;
  if (slice.length < 2) return null;
  let peak = slice[0]!;
  let mdd = 0;
  for (const p of slice) {
    if (p > peak) peak = p;
    const dd = p / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  return mdd;
}

/**
 * Sharpe ratio over a window. Uses the SAME window for return and vol.
 * rf is annualised; default 0 (spec OPEN).
 */
export function sharpe(
  series: Series,
  windowMonths: number,
  rf = SHARPE_RISK_FREE_RATE,
): number | null {
  const ann = annualised(series, windowMonths);
  const vol = volatility(series, windowMonths);
  if (ann == null || vol == null || vol === 0) return null;
  return (ann - rf) / vol;
}

/** Rebase a series so the first non-null price = base (default 10,000). */
export function rebase(series: Series, base = 10_000): Series {
  const f = firstIndex(series);
  if (f < 0) return series.map(() => null);
  const p0 = series[f]!;
  return series.map((p) => (p == null ? null : (p / p0) * base));
}

/** Rolling cumulative return over window w: P_t / P_{t-w} - 1. */
export function rollingCumulative(series: Series, w: number): (number | null)[] {
  return series.map((p, t) => {
    const prev = series[t - w];
    if (t - w < 0 || p == null || prev == null || prev === 0) return null;
    return p / prev - 1;
  });
}

/** Rolling annualised vol over window w (last w returns ending at each point). */
export function rollingVolatility(series: Series, w = 12): (number | null)[] {
  const rets = monthlyReturns(series); // length series.length-1, aligned to index+1
  const out: (number | null)[] = new Array(series.length).fill(null);
  for (let t = w; t < series.length; t++) {
    const window = rets.slice(t - w, t);
    if (window.some((r) => r == null)) {
      out[t] = null;
      continue;
    }
    out[t] = stdev(window as number[]) * Math.sqrt(12);
  }
  return out;
}
