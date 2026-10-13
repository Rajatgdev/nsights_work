/**
 * Golden tests against the real prototype dataset (build spec §6.9).
 *
 * The Zurich Life Prisma 4 month-end price series (2013-06 → 2026-08, 159 slots;
 * launched 2013-11 so the first 5 are null) is embedded so this test is
 * self-contained and runs in CI without the gitignored dataset file. Expected
 * values are the spec §6.9 reference figures, confirmed to match this series.
 *
 * Calendar-year figures are deliberately NOT asserted against the prototype's
 * displayed numbers — the prototype's were index-aligned (bug §6.3); ours are
 * year-keyed (the fix). Window-based metrics (r1/r3/r5/r7/r10, vol, mdd, Sharpe)
 * are formula-unchanged and are the golden anchors.
 */
import { describe, it, expect } from 'vitest';
import {
  totalReturn,
  annualised,
  volatility,
  maxDrawdown,
  sharpe,
  monthlyReturns,
  firstIndex,
  lastIndex,
} from '../primitives.js';
import { computeFundMetrics } from '../metrics.js';
import type { Series } from '../primitives.js';
import type { DatedSeries } from '../calendar.js';

// Month-end dates 2013-06 → 2026-08 (159 months).
const DATES: string[] = (() => {
  const out: string[] = [];
  let y = 2013;
  let m = 6;
  for (let i = 0; i < 159; i++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
})();

// Zurich Life Prisma 4 — real month-end unit prices (launch 2013-11 → 5 leading nulls).
const PRISMA4: Series = [
  null, null, null, null, null, 96.4, 96.5, 96.2, 96.5, 98.2,
  98.4, 98.9, 101.3, 102.6, 103.1, 105.9, 106.2, 106.9, 108.5, 110,
  114.7, 118.8, 121.3, 118.8, 120.5, 117.1, 119.3, 114, 112.4, 117,
  118.7, 115.4, 112.7, 112.2, 113.5, 114.5, 116.5, 116.7, 118.2, 118.4,
  118.6, 119.1, 122.9, 125.2, 125.4, 129.3, 129.1, 128.7, 127.3, 126.1,
  126.1, 125.9, 128.1, 131.5, 131.1, 132.3, 133.1, 132.6, 128.7, 131.7,
  135.1, 133.7, 135.3, 135.9, 136.5, 132.3, 132.9, 126.2, 132.7, 135.6,
  137.6, 139.4, 136.3, 139, 141.2, 140.9, 143.5, 143.7, 147, 148.6,
  149, 141.7, 127.3, 137.2, 141.9, 145, 145.8, 151.4, 150, 147.7,
  156.5, 158.9, 157.2, 160.2, 165.1, 168.9, 169.2, 173.7, 176.6, 180.2,
  176.4, 182.9, 182.1, 185.6, 179.6, 175.4, 178.5, 173.3, 171.3, 162.7,
  173.3, 167.8, 159.3, 163.5, 167.7, 160.9, 166.5, 164.8, 166.4, 166.9,
  169.1, 172.8, 175.9, 175.7, 172.1, 170.1, 177.4, 182.6, 185, 189.2,
  193.9, 191.9, 195, 198.1, 199.1, 200.4, 202.6, 202.4, 210.9, 209.3,
  214, 212.6, 202.5, 198.8, 204.6, 206.2, 210.2, 209.8, 214.9, 220.5,
  220.6, 219.8, 222.9, 225.5, 220.4, 229, 234.9, 236.8, 235.3
];

const ds: DatedSeries = { dates: DATES, series: PRISMA4 };

describe('golden: Zurich Life Prisma 4 vs spec §6.9', () => {
  it('has the right shape (159 slots, launch 2013-11)', () => {
    expect(DATES.length).toBe(159);
    expect(PRISMA4.length).toBe(159);
    expect(firstIndex(PRISMA4)).toBe(5);     // 2013-11
    expect(lastIndex(PRISMA4)).toBe(158);    // 2026-08
    expect(DATES[0]).toBe('2013-06-30');
    expect(DATES[158]).toBe('2026-08-31');
  });

  it('r1 (12m total) = +11.94%', () => {
    expect(totalReturn(PRISMA4, 12)! * 100).toBeCloseTo(11.94, 1);
  });
  it('r3 p.a. = +10.18%', () => {
    expect(annualised(PRISMA4, 36)! * 100).toBeCloseTo(10.18, 1);
  });
  it('r5 p.a. = +5.91%', () => {
    expect(annualised(PRISMA4, 60)! * 100).toBeCloseTo(5.91, 1);
  });
  it('r7 p.a. = +7.57%', () => {
    expect(annualised(PRISMA4, 84)! * 100).toBeCloseTo(7.57, 1);
  });
  it('r10 p.a. = +7.13%', () => {
    expect(annualised(PRISMA4, 120)! * 100).toBeCloseTo(7.13, 1);
  });
  it('full-period volatility (sample) = 8.40%', () => {
    expect(volatility(PRISMA4)! * 100).toBeCloseTo(8.4, 1);
  });
  it('max drawdown = -14.56%', () => {
    expect(maxDrawdown(PRISMA4)! * 100).toBeCloseTo(-14.56, 1);
  });
  it('full-period Sharpe ≈ 0.86', () => {
    const rets = monthlyReturns(PRISMA4).filter((r): r is number => r != null);
    expect(sharpe(PRISMA4, rets.length)!).toBeCloseTo(0.86, 1);
  });

  it('computeFundMetrics assembles a complete bundle', () => {
    const m = computeFundMetrics(ds);
    expect(m.r1! * 100).toBeCloseTo(11.94, 1);
    expect(m.r5! * 100).toBeCloseTo(5.91, 1);
    expect(m.volFull! * 100).toBeCloseTo(8.4, 1);
    expect(m.mddFull! * 100).toBeCloseTo(-14.56, 1);
    expect(m.firstMonth).toBe('2013-11-30');
    expect(m.lastMonth).toBe('2026-08-31');
    expect(m.monthsOfHistory).toBe(153);
    expect(m.calendarYears.length).toBe(9);
    expect(m.stress.length).toBe(4);
    // 154 non-null prices → 153 monthly returns, each in exactly one bucket.
    const totalMonthly = m.histMonthly.reduce((a, b) => a + b.count, 0);
    expect(totalMonthly).toBe(153);
  });
});