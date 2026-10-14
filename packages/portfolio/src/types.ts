/**
 * Portfolio logic types (build spec §6.6 / §6.7). Pure — the rules engine works
 * on already-loaded holdings + fund facts, so it is testable without a DB.
 */

export type Approach = 'core-satellite' | 'equal-weighted' | 'multi-manager' | 'multi-strategy';

/** A holding with the facts the rules need. Series optional (analyse needs it). */
export interface HoldingInput {
  fundId: string;
  name: string;
  provider: string;
  assetClass: string;
  riskRating: number; // 1–7
  manager?: string | null;
  style?: string | null;
  region?: string | null;
  sfdrArticle?: number | null;
  riskControlled?: boolean | null;
  weightBp: number; // basis points
  /** Price series aligned to the global month index (for analyse). */
  series?: (number | null)[];
}

export type StructureLabel = 'Single' | 'Core/Satellite' | 'Equal-weighted' | 'Diversified blend';
export type RiskLabel = 'Cautious' | 'Balanced' | 'Growth' | 'High Growth';

export interface PortfolioWarning {
  code: 'risk_spread' | 'vol_ratio' | 'same_manager';
  message: string;
}

/** A candidate fund the rules engine suggests adding, with a score + reason. */
export interface Suggestion {
  fundId: string;
  name: string;
  provider: string;
  assetClass: string;
  riskRating: number;
  score: number;
  reason: string;
}

/** Characterisation of the current holdings (no price series needed). */
export interface PortfolioProfile {
  structure: StructureLabel;
  riskLabel: RiskLabel;
  averageFundRisk: number; // weighted, 1 dp
  warnings: PortfolioWarning[];
}

/** Full analysis incl. blended performance (needs series). */
export interface PortfolioAnalysis extends PortfolioProfile {
  /** Blended value series rebased to 10,000 at the blend start. */
  blendSeries: (number | null)[];
  /** Metrics computed on the blend series (same shape as fund metrics). */
  metrics: Record<string, unknown>;
  /** Indicative risk class 1–7 from blended 5y (or full) vol. NOT a PRIIPs SRI. */
  indicativeRiskClass: number | null;
  /** Fund whose launch limits the blend start, and that start date. */
  historyLimitedBy: { fundId: string; name: string; startDate: string | null } | null;
}

/** A candidate fund in the universe, for the suggestions engine. */
export interface CandidateFund {
  fundId: string;
  name: string;
  provider: string;
  assetClass: string;
  riskRating: number;
  manager?: string | null;
  style?: string | null;
  sfdrArticle?: number | null;
  riskControlled?: boolean | null;
}
