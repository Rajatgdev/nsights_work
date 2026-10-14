/**
 * Tests for the remaining launch charts (charts-ext.ts).
 */
import { describe, it, expect } from 'vitest';
import { getChart, chartRegistry } from '../registry.js';
import type { ChartContext } from '../registry.js';
import '../index.js'; // registers CORE + EXT
import type { TableSpec } from '../charts.js';

// 72 months so 5y/vol windows compute; two funds.
const DATES = Array.from({ length: 72 }, (_, i) => {
  const y = 2019 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
});

function rising(base: number, step: number): (number | null)[] {
  return DATES.map((_, i) => base * (1 + step) ** i);
}

function ctx(): ChartContext {
  return {
    versionId: 'v1',
    compareMode: 'own',
    window: { startIndex: 0 },
    funds: [
      { id: 'a', name: 'Fund A', series: rising(100, 0.006), dates: DATES, facts: { amcPct: 0.75, ongoingChargePct: 1.1, riskRating: 5 } },
      { id: 'b', name: 'Fund B', series: rising(50, 0.004), dates: DATES, facts: { amcPct: 0.5, ongoingChargePct: 0.8, riskRating: 4 } },
    ],
  };
}

describe('registry (full set)', () => {
  it('registers all 14 launch charts', () => {
    for (const k of [
      'growth10k', 'cumulative5y', 'annualised', 'calendarYear', 'discreteAnnual',
      'rolling2y', 'historicVol', 'stressDrawdown', 'histMonthly', 'histQuarterly',
      'riskReturn', 'charges', 'keyMetrics', 'comparisonSummary',
    ] as const) {
      expect(getChart(k), k).toBeTruthy();
    }
    expect(chartRegistry.size).toBeGreaterThanOrEqual(14);
  });
});

describe('charges', () => {
  it('builds a table with cost per €10k from OCF', () => {
    const spec = getChart('charges')!.data(ctx()) as unknown as TableSpec;
    expect(spec.rows).toHaveLength(2);
    const a = spec.rows.find((r) => r.fund === 'Fund A')!;
    expect(a.ocf).toBe(1.1);
    expect(a.costPer10k).toBe(110); // 1.1% × 100
  });
});

describe('riskReturn', () => {
  it('positions funds by 5y vol (x) and 5y return (y)', () => {
    const data = getChart('riskReturn')!.data(ctx()) as { points: { name: string; x: number | null; y: number | null }[] };
    expect(data.points).toHaveLength(2);
    const a = data.points.find((p) => p.name === 'Fund A')!;
    expect(a.x).not.toBeNull(); // has 5y history
    expect(a.y).not.toBeNull();
  });
});

describe('histMonthly', () => {
  it('emits bucket labels and per-fund counts', () => {
    const data = getChart('histMonthly')!.data(ctx()) as { labels: string[]; series: { buckets: { count: number }[] }[] };
    expect(data.labels.length).toBeGreaterThan(0);
    const total = data.series[0]!.buckets.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(71); // 72 prices → 71 monthly returns
  });
});

describe('stressDrawdown', () => {
  it('emits an event list and per-fund drawdowns', () => {
    const data = getChart('stressDrawdown')!.data(ctx()) as { events: unknown[]; rows: unknown[] };
    expect(data.events.length).toBeGreaterThan(0);
    expect(data.rows).toHaveLength(2);
  });
});

describe('footnotes', () => {
  it('every ext chart footnote ends with the locked disclaimer', () => {
    for (const k of ['cumulative5y', 'rolling2y', 'stressDrawdown', 'histMonthly', 'histQuarterly', 'riskReturn', 'charges', 'discreteAnnual'] as const) {
      expect(getChart(k)!.footnote(ctx()), k).toMatch(/Past performance is not a reliable indicator/);
    }
  });
});
