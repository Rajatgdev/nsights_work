import { describe, it, expect } from 'vitest';
import {
  monthlyReturns,
  totalReturn,
  annualised,
  volatility,
  maxDrawdown,
  rebase,
  stdev,
} from '../primitives.js';
import { ytd, calendarYears } from '../calendar.js';

/** Build a month-end date index from start year/month for n months. */
function monthEndDates(startYear: number, startMonth: number, n: number): string[] {
  const out: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < n; i++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

describe('primitives', () => {
  it('monthly returns compound to total return (property)', () => {
    const series = [100, 110, 99, 121];
    const rets = monthlyReturns(series).filter((r): r is number => r != null);
    const compounded = rets.reduce((a, r) => a * (1 + r), 1) - 1;
    const total = totalReturn(series, 3)!;
    expect(compounded).toBeCloseTo(total, 10);
  });

  it('annualised equals total when m = 12', () => {
    const series = Array.from({ length: 13 }, (_, i) => 100 * 1.01 ** i);
    expect(annualised(series, 12)!).toBeCloseTo(totalReturn(series, 12)!, 10);
  });

  it('rebase sets first price to base and preserves ratios', () => {
    const series = [50, 55, 60];
    const rb = rebase(series, 10_000);
    expect(rb[0]).toBe(10_000);
    expect(rb[2]! / rb[0]!).toBeCloseTo(60 / 50, 10);
  });

  it('sample stdev differs from population (spec §6.9 Prisma vol 8.40 vs 8.38)', () => {
    const vals = [0.01, -0.02, 0.015, 0.0, 0.03, -0.01];
    const s = stdev(vals, 'sample');
    const p = stdev(vals, 'population');
    expect(s).toBeGreaterThan(p); // N-1 denominator → larger
  });

  it('max drawdown is non-positive and finds the trough', () => {
    const series = [100, 120, 90, 95, 130];
    const mdd = maxDrawdown(series)!;
    expect(mdd).toBeLessThanOrEqual(0);
    expect(mdd).toBeCloseTo(90 / 120 - 1, 10); // -0.25
  });

  it('volatility is null with insufficient data', () => {
    expect(volatility([100])).toBeNull();
  });
});

describe('calendar-year alignment (prototype bug fix)', () => {
  // Fund launched mid-2022: Dec values engineered for known yearly moves.
  // Dec-2022=100, Dec-2023=111.46, Dec-2024 ≈ 111.46*1.1397, YTD-2026 vs Dec-2025.
  it('keys returns by year, not array position; younger fund shows blanks for missing years', () => {
    const dates = monthEndDates(2022, 6, 51); // Jun 2022 → Aug 2026
    // Flat within year except step at each December for simplicity
    const series = dates.map((d) => {
      const y = Number(d.slice(0, 4));
      const decValue: Record<number, number> = {
        2022: 100,
        2023: 111.46,
        2024: 111.46 * 1.1397,
        2025: 111.46 * 1.1397 * 1.0485,
        2026: 111.46 * 1.1397 * 1.0485 * 1.082,
      };
      return decValue[y] ?? null;
    });
    const years = calendarYears({ dates, series }, 9);
    const map = Object.fromEntries(years.map((y) => [y.year, y.value]));
    // Years before launch must be null, not a wrong index-aligned value.
    expect(map[2018]).toBeNull();
    expect(map[2019]).toBeNull();
    // 2023 full-year move ≈ +11.46%
    expect(map[2023]).toBeCloseTo(0.1146, 3);
    // 2024 ≈ +13.97%
    expect(map[2024]).toBeCloseTo(0.1397, 3);
  });

  it('ytd uses prior December as base', () => {
    const dates = ['2024-12-31', '2025-06-30', '2025-12-31', '2026-06-30'];
    const series = [100, 104, 108, 114];
    // YTD at Jun 2026 = 114 / 108 - 1
    expect(ytd({ dates, series })!).toBeCloseTo(114 / 108 - 1, 10);
  });
});
