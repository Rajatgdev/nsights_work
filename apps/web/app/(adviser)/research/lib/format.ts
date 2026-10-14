/**
 * Display formatting. Metrics from the API are decimals (0.0705 = 7.05%).
 * Gains/losses are shown signed AND coloured (colour is never the only signal).
 */

/** 0.0705 → "+7.05%"; negative keeps its sign; null → "—". */
export function pct(v: number | null | undefined, dp = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  const p = v * 100;
  const s = p.toFixed(dp);
  return `${p > 0 ? '+' : ''}${s}%`;
}

/** Non-signed percentage (for vol, charges). null → "—". */
export function pctPlain(v: number | null | undefined, dp = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(dp)}%`;
}

/** A charge already stored as a percent number (amc_pct 0.5 = 0.50%). */
export function chargePct(v: number | null | undefined, dp = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(dp)}%`;
}

export function num(v: number | null | undefined, dp = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(dp);
}

/** Sign class for a signed metric: 'pos' | 'neg' | 'flat'. */
export function signClass(v: number | null | undefined): 'pos' | 'neg' | 'flat' {
  if (v == null || Number.isNaN(v) || v === 0) return 'flat';
  return v > 0 ? 'pos' : 'neg';
}

/** "2026-08-31" → "Aug 2026". */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** months → "12y 7m" / "9m". */
export function historyLabel(months: number): string {
  if (!months || months <= 0) return '—';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}m`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

export const SFDR_LABEL: Record<number, string> = {
  6: 'Article 6',
  8: 'Article 8',
  9: 'Article 9',
};

/** Risk rating 1–7 → short descriptor (indicative, not PRIIPs SRI). */
export function riskLabel(r: number | null | undefined): string {
  if (r == null) return '—';
  return `Risk ${r}/7`;
}
