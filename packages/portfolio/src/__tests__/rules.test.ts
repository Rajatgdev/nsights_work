/**
 * Rules-engine tests (build spec §6.7). Pure fixtures, no DB.
 */
import { describe, it, expect } from 'vitest';
import {
  structureLabel, riskLabel, warnings, profile, suggest, providerFit,
} from '../rules.js';
import type { HoldingInput, CandidateFund } from '../types.js';

function h(over: Partial<HoldingInput> & { fundId: string; weightBp: number; riskRating: number }): HoldingInput {
  return {
    name: over.fundId, provider: 'Zurich', assetClass: 'Multi-Asset',
    ...over,
  };
}

describe('structureLabel', () => {
  it('single fund → Single', () => {
    expect(structureLabel([h({ fundId: 'a', weightBp: 10000, riskRating: 4 })])).toBe('Single');
  });
  it('max weight ≥60% → Core/Satellite', () => {
    expect(structureLabel([
      h({ fundId: 'a', weightBp: 7000, riskRating: 4 }),
      h({ fundId: 'b', weightBp: 3000, riskRating: 5 }),
    ])).toBe('Core/Satellite');
  });
  it('within ±6pp of equal → Equal-weighted', () => {
    expect(structureLabel([
      h({ fundId: 'a', weightBp: 3400, riskRating: 4 }),
      h({ fundId: 'b', weightBp: 3300, riskRating: 4 }),
      h({ fundId: 'c', weightBp: 3300, riskRating: 4 }),
    ])).toBe('Equal-weighted');
  });
  it('otherwise → Diversified blend', () => {
    expect(structureLabel([
      h({ fundId: 'a', weightBp: 5000, riskRating: 4 }),
      h({ fundId: 'b', weightBp: 3000, riskRating: 5 }),
      h({ fundId: 'c', weightBp: 2000, riskRating: 3 }),
    ])).toBe('Diversified blend');
  });
});

describe('riskLabel', () => {
  it('maps average fund rating to bands', () => {
    expect(riskLabel(3.0)).toBe('Cautious');
    expect(riskLabel(4.0)).toBe('Balanced');
    expect(riskLabel(5.0)).toBe('Growth');
    expect(riskLabel(6.0)).toBe('High Growth');
  });
});

describe('warnings', () => {
  it('flags a risk-rating spread over 3', () => {
    const w = warnings([
      h({ fundId: 'a', weightBp: 5000, riskRating: 2 }),
      h({ fundId: 'b', weightBp: 5000, riskRating: 6 }),
    ]);
    expect(w.some((x) => x.code === 'risk_spread')).toBe(true);
  });
  it('flags a vol ratio over 3×', () => {
    const vols = new Map([['a', 0.03], ['b', 0.12]]);
    const w = warnings([
      h({ fundId: 'a', weightBp: 5000, riskRating: 3 }),
      h({ fundId: 'b', weightBp: 5000, riskRating: 5 }),
    ], vols);
    expect(w.some((x) => x.code === 'vol_ratio')).toBe(true);
  });
  it('flags all funds sharing a manager', () => {
    const w = warnings([
      h({ fundId: 'a', weightBp: 5000, riskRating: 4, manager: 'Same Co' }),
      h({ fundId: 'b', weightBp: 5000, riskRating: 4, manager: 'Same Co' }),
    ]);
    expect(w.some((x) => x.code === 'same_manager')).toBe(true);
  });
});

describe('profile', () => {
  it('bundles structure + risk label + avg risk', () => {
    const p = profile([
      h({ fundId: 'a', weightBp: 5000, riskRating: 4 }),
      h({ fundId: 'b', weightBp: 5000, riskRating: 6 }),
    ]);
    expect(p.structure).toBe('Equal-weighted');
    expect(p.averageFundRisk).toBe(5);
    expect(p.riskLabel).toBe('Growth');
  });
});

describe('suggest', () => {
  const universe: CandidateFund[] = [
    { fundId: 'x', name: 'Zurich Satellite', provider: 'Zurich', assetClass: 'Equity', riskRating: 5, manager: 'Mgr A' },
    { fundId: 'y', name: 'Aviva ESG', provider: 'Aviva', assetClass: 'Equity', riskRating: 5, manager: 'Mgr B', sfdrArticle: 8 },
    { fundId: 'z', name: 'Irish Income', provider: 'Irish Life', assetClass: 'Bond', riskRating: 3, style: 'Income' },
  ];

  it('core-satellite scores risk-near-core + same provider, returns ≤4', () => {
    const held = [h({ fundId: 'a', name: 'Zurich Core', weightBp: 10000, riskRating: 5 })];
    const s = suggest('core-satellite', held, universe);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(4);
    const zx = s.find((r) => r.fundId === 'x')!;
    expect(zx.score).toBeGreaterThanOrEqual(6); // same provider (+3) + risk near core (+3)
  });

  it('multi-strategy rewards ESG and income', () => {
    const held = [h({ fundId: 'a', weightBp: 10000, riskRating: 4 })];
    const s = suggest('multi-strategy', held, universe);
    expect(s.find((r) => r.fundId === 'y')!.reason).toMatch(/ESG/);
    expect(s.find((r) => r.fundId === 'z')!.reason).toMatch(/income/i);
  });

  it('excludes funds already held', () => {
    const held = [h({ fundId: 'x', name: 'Zurich Satellite', provider: 'Zurich', weightBp: 10000, riskRating: 5 })];
    const s = suggest('core-satellite', held, universe);
    expect(s.find((r) => r.fundId === 'x')).toBeUndefined();
  });
});

describe('providerFit', () => {
  it('core-satellite needs a multi-asset core + a satellite', () => {
    const ok = providerFit('core-satellite', [
      h({ fundId: 'a', weightBp: 7000, riskRating: 4, assetClass: 'Multi-Asset' }),
      h({ fundId: 'b', weightBp: 3000, riskRating: 5, assetClass: 'Equity' }),
    ]);
    expect(ok.ok).toBe(true);
    const bad = providerFit('core-satellite', [h({ fundId: 'a', weightBp: 10000, riskRating: 4, assetClass: 'Equity' })]);
    expect(bad.ok).toBe(false);
  });
  it('multi-manager needs ≥2 managers', () => {
    expect(providerFit('multi-manager', [
      h({ fundId: 'a', weightBp: 5000, riskRating: 4, manager: 'A' }),
      h({ fundId: 'b', weightBp: 5000, riskRating: 4, manager: 'B' }),
    ]).ok).toBe(true);
  });
});
