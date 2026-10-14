/**
 * Chart registry tests (spec §7). Assert data/facts/footnote shapes against a
 * small deterministic context. Pure — no DB, no ECharts rendering.
 */
import { describe, it, expect } from 'vitest';
import { chartRegistry, getChart } from '../registry.js';
import type { ChartContext } from '../registry.js';
import '../index.js'; // side-effect: registers CORE_CHARTS
import type { TableSpec } from '../charts.js';

// 13 month-end dates, two funds; AAA launched later (5 leading nulls).
const DATES = [
  '2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31',
  '2024-06-30', '2024-07-31', '2024-08-31', '2024-09-30', '2024-10-31',
  '2024-11-30', '2024-12-31', '2025-01-31',
];

function ctx(compareMode: 'common' | 'own' = 'common'): ChartContext {
  const bbb = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112];
  const aaa: (number | null)[] = [null, null, null, null, null, 50, 51, 52, 53, 54, 55, 56, 57];
  const startIndex = compareMode === 'common' ? 5 : 0;
  return {
    versionId: 'v1',
    compareMode,
    window: { startIndex },
    funds: [
      { id: 'bbb', name: 'Beta Fund', series: bbb, dates: DATES },
      { id: 'aaa', name: 'Alpha Fund', series: aaa, dates: DATES },
    ],
  };
}

describe('registry', () => {
  it('registers the core 6 charts', () => {
    for (const k of ['growth10k', 'annualised', 'calendarYear', 'historicVol', 'keyMetrics', 'comparisonSummary'] as const) {
      expect(getChart(k), k).toBeTruthy();
    }
    expect(chartRegistry.size).toBeGreaterThanOrEqual(6);
  });
});

describe('growth10k', () => {
  it('rebases each fund to 10,000 at the window start', () => {
    const def = getChart('growth10k')!;
    const data = def.data(ctx('common')) as {
      dates: string[];
      series: { name: string; values: (number | null)[] }[];
    };
    expect(data.dates).toHaveLength(8);
    for (const s of data.series) {
      expect(s.values[0]).toBe(10000);
    }
    const beta = data.series.find((s) => s.name === 'Beta Fund')!;
    expect(beta.values[beta.values.length - 1]).toBeGreaterThan(10600);
    expect(beta.values[beta.values.length - 1]).toBeLessThan(10700);
  });

  it('produces a footnote ending with the locked disclaimer', () => {
    const def = getChart('growth10k')!;
    const fn = def.footnote(ctx());
    expect(fn).toMatch(/Past performance is not a reliable indicator/);
  });
});

describe('annualised', () => {
  it('emits buckets and per-fund values', () => {
    const def = getChart('annualised')!;
    const data = def.data(ctx('own')) as {
      buckets: { key: string }[];
      rows: { name: string; values: Record<string, number | null> }[];
    };
    expect(data.buckets.map((b) => b.key)).toContain('ytd');
    expect(data.rows).toHaveLength(2);
    const beta = data.rows.find((r) => r.name === 'Beta Fund')!;
    expect(beta.values.ytd).not.toBeNull();
  });
});

describe('keyMetrics table', () => {
  it('returns a TableSpec with fund rows and columns', () => {
    const def = getChart('keyMetrics')!;
    const spec = def.data(ctx('common')) as unknown as TableSpec;
    expect(spec.columns[0]!.key).toBe('fund');
    expect(spec.rows).toHaveLength(2);
    expect(spec.rows[0]).toHaveProperty('r5');
  });
});

describe('facts', () => {
  it('growth10k facts carry final values', () => {
    const def = getChart('growth10k')!;
    const data = def.data(ctx());
    const facts = def.facts(data);
    expect(Object.keys(facts).some((k) => k.startsWith('final_'))).toBe(true);
  });

  it('fallback sentence is deterministic and non-empty', () => {
    const def = getChart('growth10k')!;
    const facts = def.facts(def.data(ctx()));
    const s = def.fallback(facts);
    expect(s.length).toBeGreaterThan(0);
  });
});