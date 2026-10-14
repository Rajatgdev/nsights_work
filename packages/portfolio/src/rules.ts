/**
 * Portfolio rules engine (build spec §6.7). Deterministic logic ported from the
 * prototype's screens-portfolio.jsx — explicitly NOT AI, never branded as such.
 *
 * Covers: structure label, risk label, warnings, scored fund suggestions per
 * approach, and provider-fit per approach.
 */
import { averageFundRisk } from '@nsights/calc';
import { PORTFOLIO_WEIGHT_TOTAL_BP } from '@nsights/shared';
import type {
  Approach,
  CandidateFund,
  HoldingInput,
  PortfolioProfile,
  PortfolioWarning,
  RiskLabel,
  StructureLabel,
  Suggestion,
} from './types.js';

const EQUAL_TOL_PP = 6; // within ±6pp of equal → Equal-weighted
const CORE_MIN_PP = 60; // max weight ≥60% → Core/Satellite

function weightsPct(holdings: HoldingInput[]): number[] {
  const total = holdings.reduce((a, h) => a + h.weightBp, 0) || PORTFOLIO_WEIGHT_TOTAL_BP;
  return holdings.map((h) => (h.weightBp / total) * 100);
}

/** §6.7 structure label. */
export function structureLabel(holdings: HoldingInput[]): StructureLabel {
  if (holdings.length <= 1) return 'Single';
  const pct = weightsPct(holdings);
  const maxW = Math.max(...pct);
  if (maxW >= CORE_MIN_PP) return 'Core/Satellite';
  const equal = 100 / holdings.length;
  if (pct.every((w) => Math.abs(w - equal) <= EQUAL_TOL_PP)) return 'Equal-weighted';
  return 'Diversified blend';
}

/** §6.7 risk label from average fund rating. */
export function riskLabel(avgRisk: number): RiskLabel {
  if (avgRisk < 3.5) return 'Cautious';
  if (avgRisk < 4.5) return 'Balanced';
  if (avgRisk < 5.5) return 'Growth';
  return 'High Growth';
}

/** §6.7 warnings. volByFund optional (vol-ratio check skipped if absent). */
export function warnings(
  holdings: HoldingInput[],
  volByFund?: Map<string, number | null>,
): PortfolioWarning[] {
  const out: PortfolioWarning[] = [];
  if (holdings.length < 2) return out;

  // risk-rating spread > 3
  const risks = holdings.map((h) => h.riskRating);
  const spread = Math.max(...risks) - Math.min(...risks);
  if (spread > 3) {
    out.push({ code: 'risk_spread', message: `Wide risk spread: ratings range ${Math.min(...risks)}–${Math.max(...risks)} (over 3 apart).` });
  }

  // max vol / min vol > 3
  if (volByFund) {
    const vols = holdings.map((h) => volByFund.get(h.fundId)).filter((v): v is number => v != null && v > 0);
    if (vols.length >= 2) {
      const ratio = Math.max(...vols) / Math.min(...vols);
      if (ratio > 3) out.push({ code: 'vol_ratio', message: `Volatility of the funds varies more than 3× across the blend.` });
    }
  }

  // all funds same manager
  const managers = holdings.map((h) => h.manager).filter((m): m is string => !!m);
  if (managers.length === holdings.length && managers.length > 1 && new Set(managers).size === 1) {
    out.push({ code: 'same_manager', message: `All funds share the same manager (${managers[0]}).` });
  }

  return out;
}

/** Profile = structure + risk label + warnings (no price series needed). */
export function profile(
  holdings: HoldingInput[],
  volByFund?: Map<string, number | null>,
): PortfolioProfile {
  const avg = averageFundRisk(holdings.map((h) => ({ weightBp: h.weightBp, riskRating: h.riskRating })));
  return {
    structure: structureLabel(holdings),
    riskLabel: riskLabel(avg),
    averageFundRisk: avg,
    warnings: warnings(holdings, volByFund),
  };
}

/**
 * §6.7 scored suggestions. Candidates = funds in the live universe not already
 * held; scored by the approach's rules; top 4 returned. "Rules engine", not AI.
 */
export function suggest(
  approach: Approach,
  holdings: HoldingInput[],
  universe: CandidateFund[],
): Suggestion[] {
  const heldIds = new Set(holdings.map((h) => h.fundId));
  const heldProviders = new Set(holdings.map((h) => h.provider));
  const heldManagers = new Set(holdings.map((h) => h.manager).filter(Boolean));
  const avg = holdings.length
    ? averageFundRisk(holdings.map((h) => ({ weightBp: h.weightBp, riskRating: h.riskRating })))
    : 4;
  const core = holdings.length === 1 ? holdings[0]! : null;

  const scored: Suggestion[] = [];
  for (const c of universe) {
    if (heldIds.has(c.fundId)) continue;
    let score = 0;
    const reasons: string[] = [];

    // candidate from a provider already in the mix (+3 baseline per §6.7)
    if (heldProviders.has(c.provider)) { score += 3; reasons.push('same provider'); }

    if (approach === 'core-satellite' && core) {
      if (Math.abs(c.riskRating - core.riskRating) <= 1) { score += 3; reasons.push('risk near the core'); }
    } else if (approach === 'multi-strategy') {
      if (c.sfdrArticle === 8 || c.sfdrArticle === 9) { score += 4; reasons.push('adds ESG'); }
      if (c.style && /income/i.test(c.style)) { score += 4; reasons.push('adds income'); }
      if (c.style && /passive|index|track/i.test(c.style)) { score += 3; reasons.push('adds passive'); }
    } else if (approach === 'multi-manager') {
      if (c.manager && !heldManagers.has(c.manager)) { score += 4; reasons.push('new manager'); }
    } else if (approach === 'equal-weighted') {
      if (Math.abs(c.riskRating - avg) <= 1) { score += 3; reasons.push('risk near the average'); }
    }

    if (score > 0) {
      scored.push({
        fundId: c.fundId,
        name: c.name,
        provider: c.provider,
        assetClass: c.assetClass,
        riskRating: c.riskRating,
        score,
        reason: reasons.join(' · '),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, 4);
}

export interface ProviderFit {
  ok: boolean;
  message: string;
}

/** §6.7 provider-fit per approach (does the current mix satisfy the approach?). */
export function providerFit(approach: Approach, holdings: HoldingInput[]): ProviderFit {
  if (holdings.length === 0) return { ok: false, message: 'Add funds to assess fit for this approach.' };

  switch (approach) {
    case 'core-satellite': {
      const hasCore = holdings.some((h) => h.assetClass === 'Multi-Asset');
      const hasSatellite = holdings.some((h) => h.assetClass !== 'Multi-Asset');
      const ok = hasCore && hasSatellite;
      return { ok, message: ok ? 'Has a multi-asset core and at least one satellite.' : 'Needs a multi-asset core plus at least one single-asset/theme satellite.' };
    }
    case 'multi-manager': {
      const managers = new Set(holdings.map((h) => h.manager).filter(Boolean));
      const ok = managers.size >= 2;
      return { ok, message: ok ? `Spans ${managers.size} managers.` : 'Needs at least two distinct managers.' };
    }
    case 'multi-strategy': {
      const styles = new Set(holdings.map((h) => h.style).filter(Boolean));
      const ok = styles.size >= 2;
      return { ok, message: ok ? `Spans ${styles.size} strategies.` : 'Needs at least two distinct strategies.' };
    }
    case 'equal-weighted': {
      const ok = holdings.length >= 3;
      return { ok, message: ok ? `${holdings.length} funds near target weight.` : 'Needs at least three funds near the target risk.' };
    }
    default:
      return { ok: true, message: '' };
  }
}
