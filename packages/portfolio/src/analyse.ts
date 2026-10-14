/**
 * Portfolio analysis (build spec §6.6). Blends the holdings, computes metrics on
 * the blend series, derives the indicative risk class, and reports which fund's
 * launch limits the blend history.
 *
 * Risk framing (spec §6.6): the indicative class comes from the blended
 * volatility and is explicitly NOT a PRIIPs SRI; the weighted "average fund
 * risk rating" is a separate number. Never conflate them.
 */
import {
  blend,
  computeFundMetrics,
  riskClassFromVol,
  volatility,
  type Leg,
  type Rebalancing,
  type DatedSeries,
} from '@nsights/calc';
import { profile } from './rules.js';
import type { HoldingInput, PortfolioAnalysis, PortfolioWarning } from './types.js';

export interface AnalyseInput {
  holdings: HoldingInput[]; // each must carry `series`
  dates: string[]; // global month index
  rebalancing?: Rebalancing;
}

/** Index where every leg first has a price (blend start). */
function blendStartIndex(holdings: HoldingInput[]): number {
  const firsts = holdings.map((h) => (h.series ?? []).findIndex((v) => v != null));
  return firsts.length ? Math.max(...firsts) : -1;
}

export function analyse(input: AnalyseInput): PortfolioAnalysis {
  const { holdings, dates, rebalancing = 'monthly' } = input;

  // per-fund 5y vol for the vol-ratio warning
  const volByFund = new Map<string, number | null>();
  for (const h of holdings) volByFund.set(h.fundId, volatility(h.series ?? [], 60));

  const prof = profile(holdings, volByFund);

  // blend (weights must sum to 10,000 — the API validates before calling).
  const legs: Leg[] = holdings.map((h) => ({ series: h.series ?? [], weightBp: h.weightBp }));
  let blendSeries: (number | null)[] = [];
  let metrics: Record<string, unknown> = {};
  let indicativeRiskClass: number | null = null;
  try {
    blendSeries = blend(legs, rebalancing);
    const ds: DatedSeries = { dates, series: blendSeries };
    metrics = computeFundMetrics(ds) as unknown as Record<string, unknown>;
    // indicative class from blended 5y vol (full history if <5y).
    const vol5 = volatility(blendSeries, 60) ?? volatility(blendSeries);
    indicativeRiskClass = vol5 != null ? riskClassFromVol(vol5 * 100) : null;
  } catch {
    // weights not summing etc. — leave blend empty; profile still returned.
  }

  // which fund limits the start
  let historyLimitedBy: PortfolioAnalysis['historyLimitedBy'] = null;
  const startIdx = blendStartIndex(holdings);
  if (startIdx >= 0) {
    const limiter = holdings.find((h) => (h.series ?? []).findIndex((v) => v != null) === startIdx);
    if (limiter) historyLimitedBy = { fundId: limiter.fundId, name: limiter.name, startDate: dates[startIdx] ?? null };
  }

  return {
    ...prof,
    blendSeries,
    metrics,
    indicativeRiskClass,
    historyLimitedBy,
  };
}

/** Re-export for API convenience. */
export type { PortfolioWarning };
