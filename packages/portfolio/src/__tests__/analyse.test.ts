/**
 * analyse() tests (build spec §6.6): blend, metrics, indicative risk class,
 * history-limited-by.
 */
import { describe, it, expect } from 'vitest';
import { analyse } from '../analyse.js';
import type { HoldingInput } from '../types.js';

const DATES = Array.from({ length: 72 }, (_, i) => {
  const y = 2019 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
});

function rising(base: number, step: number, leadNulls = 0): (number | null)[] {
  return DATES.map((_, i) => (i < leadNulls ? null : base * (1 + step) ** (i - leadNulls)));
}

function hold(over: Partial<HoldingInput> & { fundId: string; weightBp: number; riskRating: number; series: (number | null)[] }): HoldingInput {
  return { name: over.fundId, provider: 'Zurich', assetClass: 'Multi-Asset', ...over };
}

describe('analyse', () => {
  it('blends two funds and computes metrics + indicative risk class', () => {
    const a = analyse({
      dates: DATES,
      holdings: [
        hold({ fundId: 'a', weightBp: 6000, riskRating: 4, series: rising(100, 0.005) }),
        hold({ fundId: 'b', weightBp: 4000, riskRating: 5, series: rising(50, 0.008) }),
      ],
    });
    expect(a.blendSeries.length).toBe(72);
    expect(a.blendSeries.find((v) => v != null)).toBe(10000); // rebased at start
    expect(a.indicativeRiskClass).toBeGreaterThanOrEqual(1);
    expect(a.indicativeRiskClass).toBeLessThanOrEqual(7);
    expect(a.averageFundRisk).toBe(4.4); // 0.6×4 + 0.4×5
    expect(a.metrics).toHaveProperty('vol5y');
  });

  it('reports the fund whose launch limits the blend start', () => {
    const a = analyse({
      dates: DATES,
      holdings: [
        hold({ fundId: 'old', name: 'Old Fund', weightBp: 5000, riskRating: 4, series: rising(100, 0.005) }),
        hold({ fundId: 'young', name: 'Young Fund', weightBp: 5000, riskRating: 5, series: rising(100, 0.006, 24) }),
      ],
    });
    expect(a.historyLimitedBy?.fundId).toBe('young');
    expect(a.historyLimitedBy?.startDate).toBe(DATES[24]);
  });
});
