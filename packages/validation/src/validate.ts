/**
 * Upload validation (build spec §5.3 / §5.4). Pure — no I/O.
 * Produces errors (block publish) and warnings (publish after acknowledge),
 * plus the summary/diff shown before publish.
 */
import {
    MOM_MOVE_ERROR_PCT,
    MOM_MOVE_WARN_PCT,
    HISTORICAL_CHANGE_ERROR_PCT,
    STALE_REPEAT_MONTHS,
  } from '@nsights/shared';
  import type {
    ParsedUpload,
    LiveSnapshot,
    ValidationIssue,
    ValidationReport,
    ValidationSummary,
  } from './types.js';
  
  const E = (code: string, message: string, fundCode?: string, date?: string): ValidationIssue => ({
    severity: 'error',
    code,
    message,
    fundCode,
    date,
  });
  const W = (code: string, message: string, fundCode?: string, date?: string): ValidationIssue => ({
    severity: 'warning',
    code,
    message,
    fundCode,
    date,
  });
  
  /** Months must be contiguous month-ends, ascending, no duplicates. */
  function checkMonthsContiguous(dates: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]!;
      if (seen.has(d)) issues.push(E('duplicate_month', `Duplicate month row ${d}`, undefined, d));
      seen.add(d);
      if (i > 0) {
        const prev = new Date(dates[i - 1]!);
        const cur = new Date(d);
        const months =
          (cur.getUTCFullYear() - prev.getUTCFullYear()) * 12 +
          (cur.getUTCMonth() - prev.getUTCMonth());
        if (months !== 1) {
          issues.push(E('months_not_contiguous', `Months not contiguous: ${dates[i - 1]} → ${d}`, undefined, d));
        }
      }
    }
    return issues;
  }
  
  export function validateUpload(upload: ParsedUpload, live: LiveSnapshot): ValidationReport {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
  
    const uploadCodes = Object.keys(upload.prices);
    const fundRowCodes = new Set(upload.funds.map((f) => f.code));
  
    // ── Month structure ──
    errors.push(...checkMonthsContiguous(upload.dates));
  
    // ── Per-fund price checks ──
    for (const code of uploadCodes) {
      // unknown fund code not in Funds sheet
      if (!fundRowCodes.has(code)) {
        errors.push(E('unknown_fund_code', `Price column "${code}" has no row in the Funds sheet`, code));
      }
  
      const series = upload.prices[code]!;
      let firstIdx = series.findIndex((v) => v != null);
  
      // leading blanks = pre-launch (null), never 1 — just skip them.
      for (let i = 0; i < series.length; i++) {
        const v = series[i];
        const date = upload.dates[i]!;
  
        if (v == null) {
          // gap inside live history (blank after first price, before closed)
          if (firstIdx >= 0 && i > firstIdx) {
            const laterHasValue = series.slice(i + 1).some((x) => x != null);
            if (laterHasValue) {
              errors.push(E('gap_in_history', `Gap inside price history for ${code} at ${date}`, code, date));
            }
          }
          continue;
        }
  
        if (typeof v !== 'number' || Number.isNaN(v)) {
          errors.push(E('non_numeric_price', `Non-numeric price for ${code} at ${date}`, code, date));
          continue;
        }
        if (v <= 0) {
          errors.push(E('non_positive_price', `Negative or zero price for ${code} at ${date}`, code, date));
          continue;
        }
  
        // month-on-month move
        const prev = i > 0 ? series[i - 1] : null;
        if (prev != null && prev > 0) {
          const move = Math.abs(v / prev - 1) * 100;
          if (move > MOM_MOVE_ERROR_PCT) {
            errors.push(E('mom_move_over_30', `${code} moved ${move.toFixed(1)}% at ${date} (> ${MOM_MOVE_ERROR_PCT}%)`, code, date));
          } else if (move > MOM_MOVE_WARN_PCT) {
            warnings.push(W('mom_move_over_12', `${code} moved ${move.toFixed(1)}% at ${date} (> ${MOM_MOVE_WARN_PCT}%)`, code, date));
          }
  
          // scale jump ~100x or ~0.01x (cents vs euro)
          const ratio = v / prev;
          if (ratio > 50 || ratio < 0.02) {
            warnings.push(W('price_scale_jump', `${code} price scale jump at ${date} (ratio ${ratio.toFixed(2)})`, code, date));
          }
        }
      }
  
      // stale: same price repeated >= N consecutive months
      let run = 1;
      for (let i = 1; i < series.length; i++) {
        if (series[i] != null && series[i] === series[i - 1]) {
          run++;
          if (run === STALE_REPEAT_MONTHS) {
            warnings.push(W('stale_price', `${code} price repeated ${STALE_REPEAT_MONTHS}+ months to ${upload.dates[i]}`, code, upload.dates[i]));
          }
        } else {
          run = 1;
        }
      }
    }
  
    // ── Live comparison: missing funds, historical changes ──
    const changedHistoricalPrices: ValidationSummary['changedHistoricalPrices'] = [];
    for (const code of live.liveCodes) {
      if (!uploadCodes.includes(code) && !live.closedCodes.includes(code)) {
        errors.push(E('live_fund_missing', `Fund ${code} in live data is missing from the upload (and not closed)`, code));
      }
      // historical price change > 0.5% (no "correction" tick in this pass → error)
      const liveSeries = live.prices[code];
      const upSeries = upload.prices[code];
      if (liveSeries && upSeries) {
        const overlap = Math.min(live.dates.length, upload.dates.length);
        for (let i = 0; i < overlap; i++) {
          const lv = liveSeries[i];
          const uv = upSeries[i];
          if (lv != null && uv != null && lv > 0) {
            const diff = Math.abs(uv / lv - 1) * 100;
            if (diff > HISTORICAL_CHANGE_ERROR_PCT) {
              errors.push(E('historical_price_changed', `Historical price for ${code} at ${upload.dates[i]} changed ${diff.toFixed(2)}% vs live`, code, upload.dates[i]));
              changedHistoricalPrices.push({ fundCode: code, date: upload.dates[i]!, from: lv, to: uv });
            }
          }
        }
      }
    }
  
    // added / removed funds (warnings + summary)
    const addedFunds = uploadCodes.filter((c) => !live.liveCodes.includes(c));
    const removedFunds = live.liveCodes.filter((c) => !uploadCodes.includes(c));
    for (const c of addedFunds) warnings.push(W('new_fund', `New fund added: ${c}`, c));
    for (const c of removedFunds) warnings.push(W('fund_removed', `Fund removed/closed: ${c}`, c));
  
    // ── Summary / diff (§5.4) ──
    const fundsWithFullHistory = uploadCodes.filter(
      (c) => upload.prices[c]!.every((v) => v != null),
    ).length;
    const newMonthCount = Math.max(0, upload.dates.length - live.dates.length);
  
    const summary: ValidationSummary = {
      fundsFound: uploadCodes.length,
      monthsCovered: {
        first: upload.dates[0] ?? null,
        last: upload.dates[upload.dates.length - 1] ?? null,
        count: upload.dates.length,
      },
      fundsWithFullHistory,
      newMonthCount,
      addedFunds,
      removedFunds,
      changedHistoricalPrices,
    };
  
    return { errors, warnings, summary, publishable: errors.length === 0 };
  }