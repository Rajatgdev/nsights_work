/**
 * Validation types (build spec §5). The validator works on already-parsed
 * upload data, so it is pure and testable without Excel or a DB.
 */

/** A fund row from the upload's `Funds` sheet. */
export interface UploadFundRow {
    code: string; // platform-internal fund code (header in Prices sheet)
    name: string;
    provider: string;
    assetClass: string;
    category?: string;
    launchDate?: string;
    riskRating?: number; // 1–7
    ongoingChargePct?: number;
    amcPct?: number;
    manager?: string;
    style?: string;
    region?: string;
    riskControlled?: boolean;
    sfdrArticle?: number; // 6 | 8 | 9
    description?: string;
    closed?: boolean; // closed=Y
  }
  
  /** The parsed upload: month-end dates + a price column per fund code. */
  export interface ParsedUpload {
    /** Month-end ISO dates, ascending. */
    dates: string[];
    /** fund code → prices aligned to `dates` (null = blank cell). */
    prices: Record<string, (number | null)[]>;
    funds: UploadFundRow[];
  }
  
  /** The current live data to compare against (for history/correction checks). */
  export interface LiveSnapshot {
    dates: string[];
    prices: Record<string, (number | null)[]>; // keyed by fund code
    /** fund codes present in the live version. */
    liveCodes: string[];
    /** fund codes marked closed in live. */
    closedCodes: string[];
  }
  
  export type Severity = 'error' | 'warning';
  
  export interface ValidationIssue {
    severity: Severity;
    code: string; // machine code, e.g. 'mom_move_over_30'
    message: string;
    fundCode?: string;
    date?: string;
  }
  
  export interface ValidationSummary {
    fundsFound: number;
    monthsCovered: { first: string | null; last: string | null; count: number };
    fundsWithFullHistory: number;
    newMonthCount: number;
    addedFunds: string[];
    removedFunds: string[];
    changedHistoricalPrices: { fundCode: string; date: string; from: number; to: number }[];
  }
  
  export interface ValidationReport {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    summary: ValidationSummary;
    /** true when there are zero errors (publish allowed after ack of warnings). */
    publishable: boolean;
  }