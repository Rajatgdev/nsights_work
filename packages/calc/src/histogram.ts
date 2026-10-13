/**
 * Return-distribution histograms (spec §6.5).
 * Buckets from @nsights/shared; returns as PERCENT (e.g. 2.5 = +2.5%).
 * "% positive" excludes exactly-zero months (spec DECISION).
 */
import { HIST_MONTHLY_BUCKETS, HIST_QUARTERLY_BUCKETS } from '@nsights/shared';

interface Bucket {
  label: string;
  min: number;
  max: number;
}

function bucketCounts(returnsPct: number[], buckets: readonly Bucket[]) {
  const counts = buckets.map((b) => ({ label: b.label, count: 0 }));
  for (const r of returnsPct) {
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]!;
      // upper-exclusive except the final (open) bucket
      const isLast = i === buckets.length - 1;
      if (r >= b.min && (isLast ? true : r < b.max)) {
        counts[i]!.count++;
        break;
      }
    }
  }
  return counts;
}

export function monthlyHistogram(monthlyReturns: number[]) {
  const pct = monthlyReturns.map((r) => r * 100);
  return bucketCounts(pct, HIST_MONTHLY_BUCKETS);
}

export function quarterlyHistogram(quarterlyReturns: number[]) {
  const pct = quarterlyReturns.map((r) => r * 100);
  return bucketCounts(pct, HIST_QUARTERLY_BUCKETS);
}

/** Share of returns > 0 (zeros excluded). */
export function percentPositive(returns: number[]): number | null {
  const nonZero = returns.filter((r) => r !== 0);
  if (nonZero.length === 0) return null;
  return nonZero.filter((r) => r > 0).length / nonZero.length;
}
