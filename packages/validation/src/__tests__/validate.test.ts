/**
 * Fixture suite for the validation engine (build spec §5.3 / §13).
 * Each test builds a small in-memory upload + live snapshot and asserts the
 * right error/warning fires (or doesn't). No Excel, no DB — pure rule checks.
 */
import { describe, it, expect } from 'vitest';
import { validateUpload } from '../validate.js';
import type { ParsedUpload, LiveSnapshot, UploadFundRow } from '../types.js';

// 6 month-end dates for compact fixtures.
const DATES = [
  '2025-01-31',
  '2025-02-28',
  '2025-03-31',
  '2025-04-30',
  '2025-05-31',
  '2025-06-30',
];

function fundRow(code: string, over: Partial<UploadFundRow> = {}): UploadFundRow {
  return { code, name: code, provider: 'Zurich', assetClass: 'Multi-Asset', ...over };
}

/** A clean upload: two funds, gently rising prices, all rows present. */
function goodUpload(): ParsedUpload {
  return {
    dates: [...DATES],
    prices: {
      AAA: [100, 101, 102, 103, 104, 105],
      BBB: [50, 50.5, 51, 51.5, 52, 52.5],
    },
    funds: [fundRow('AAA'), fundRow('BBB')],
  };
}

/** Live snapshot matching the good upload's first 5 months (so month 6 is "new"). */
function liveMatching(): LiveSnapshot {
  return {
    dates: DATES.slice(0, 5),
    prices: {
      AAA: [100, 101, 102, 103, 104],
      BBB: [50, 50.5, 51, 51.5, 52],
    },
    liveCodes: ['AAA', 'BBB'],
    closedCodes: [],
  };
}

const hasCode = (issues: { code: string }[], code: string) =>
  issues.some((i) => i.code === code);

/** Get a fund's price array, asserting it exists (test-only convenience). */
function col(up: ParsedUpload, code: string): (number | null)[] {
  const c = up.prices[code];
  if (!c) throw new Error(`fixture missing column ${code}`);
  return c;
}

describe('validation fixtures (§5.3)', () => {
  it('good upload: no errors, publishable, 1 new month', () => {
    const r = validateUpload(goodUpload(), liveMatching());
    expect(r.errors).toHaveLength(0);
    expect(r.publishable).toBe(true);
    expect(r.summary.newMonthCount).toBe(1);
    expect(r.summary.fundsFound).toBe(2);
    expect(r.summary.fundsWithFullHistory).toBe(2);
  });

  it('text / non-numeric price → error', () => {
    const up = goodUpload();
    // simulate a text cell that slipped through parsing
    col(up, 'AAA')[2] = 'n/a' as unknown as number;
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.errors, 'non_numeric_price')).toBe(true);
    expect(r.publishable).toBe(false);
  });

  it('negative / zero price → error', () => {
    const up = goodUpload();
    col(up, 'BBB')[3] = -5;
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.errors, 'non_positive_price')).toBe(true);
  });

  it('gap inside history → error', () => {
    const up = goodUpload();
    col(up, 'AAA')[3] = null; // blank between prices
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.errors, 'gap_in_history')).toBe(true);
  });

  it('leading blanks (pre-launch) are OK, not a gap', () => {
    const up = goodUpload();
    up.prices.AAA = [null, null, 102, 103, 104, 105]; // launched month 3
    const live: LiveSnapshot = {
      ...liveMatching(),
      prices: { AAA: [null, null, 102, 103, 104], BBB: [50, 50.5, 51, 51.5, 52] },
    };
    const r = validateUpload(up, live);
    expect(hasCode(r.errors, 'gap_in_history')).toBe(false);
  });

  it('month-on-month move > 30% → error', () => {
    const up = goodUpload();
    col(up, 'AAA')[2] = 200; // +98% jump
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.errors, 'mom_move_over_30')).toBe(true);
  });

  it('month-on-month move 12–30% → warning (not error)', () => {
    const up = goodUpload();
    col(up, 'BBB')[4] = 60; // ~15% from 52
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.warnings, 'mom_move_over_12')).toBe(true);
    expect(hasCode(r.errors, 'mom_move_over_30')).toBe(false);
  });

  it('100× scale error → scale-jump warning (and MoM error)', () => {
    const up = goodUpload();
    col(up, 'AAA')[2] = 10200; // cents vs euro
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.warnings, 'price_scale_jump')).toBe(true);
  });

  it('stale price repeated 3+ months → warning', () => {
    const up = goodUpload();
    up.prices.BBB = [50, 50, 50, 50, 52, 52.5]; // 4 identical
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.warnings, 'stale_price')).toBe(true);
  });

  it('unknown fund code (no Funds row) → error', () => {
    const up = goodUpload();
    up.funds = [fundRow('AAA')]; // BBB column has no row
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.errors, 'unknown_fund_code')).toBe(true);
  });

  it('live fund missing from upload (not closed) → error', () => {
    const up = goodUpload();
    delete up.prices.BBB;
    up.funds = [fundRow('AAA')];
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.errors, 'live_fund_missing')).toBe(true);
    expect(r.summary.removedFunds).toContain('BBB');
  });

  it('live fund missing but marked closed → OK', () => {
    const up = goodUpload();
    delete up.prices.BBB;
    up.funds = [fundRow('AAA')];
    const live = liveMatching();
    live.closedCodes = ['BBB'];
    const r = validateUpload(up, live);
    expect(hasCode(r.errors, 'live_fund_missing')).toBe(false);
  });

  it('historical price changed > 0.5% vs live → error + summary', () => {
    const up = goodUpload();
    col(up, 'AAA')[1] = 110; // live had 101
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.errors, 'historical_price_changed')).toBe(true);
    expect(r.summary.changedHistoricalPrices.length).toBeGreaterThan(0);
  });

  it('non-contiguous / duplicate months → error', () => {
    const up = goodUpload();
    up.dates = ['2025-01-31', '2025-01-31', '2025-03-31', '2025-04-30', '2025-05-31', '2025-06-30'];
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.errors, 'duplicate_month')).toBe(true);
    expect(hasCode(r.errors, 'months_not_contiguous')).toBe(true);
  });

  it('new fund added → warning + summary', () => {
    const up = goodUpload();
    up.prices.CCC = [10, 10.1, 10.2, 10.3, 10.4, 10.5];
    up.funds.push(fundRow('CCC'));
    const r = validateUpload(up, liveMatching());
    expect(hasCode(r.warnings, 'new_fund')).toBe(true);
    expect(r.summary.addedFunds).toContain('CCC');
  });
});