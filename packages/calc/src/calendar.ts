/**
 * Calendar-year / YTD / quarterly calculations (spec §6.3).
 *
 * CRITICAL: everything here is keyed by YEAR from the date index, never by
 * array position — this is the prototype bug fix. A fund without a given year
 * returns null for that year.
 *
 * Dates are month-end ISO strings aligned 1:1 with the price series.
 */
import type { Series } from './primitives.js';

export interface DatedSeries {
  dates: string[]; // month-end ISO, e.g. "2025-12-31"
  series: Series;
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}
function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

/** Index of the December (month 12) price for a given year, or -1. */
function decemberIndex({ dates }: DatedSeries, year: number): number {
  return dates.findIndex((d) => yearOf(d) === year && monthOf(d) === 12);
}

/** Last available index within a year (for partial current year). */
function lastIndexInYear({ dates, series }: DatedSeries, year: number): number {
  for (let i = dates.length - 1; i >= 0; i--) {
    if (yearOf(dates[i]!) === year && series[i] != null) return i;
  }
  return -1;
}

/** Calendar-year return for year Y: P(Dec Y)/P(Dec Y-1) - 1. Partial current year = YTD (flagged). */
export function calendarYearReturn(
  ds: DatedSeries,
  year: number,
): { value: number | null; partial: boolean } {
  const decPrev = decemberIndex(ds, year - 1);
  const decCur = decemberIndex(ds, year);
  if (decPrev >= 0 && decCur >= 0) {
    const a = ds.series[decCur];
    const b = ds.series[decPrev];
    if (a != null && b != null && b !== 0) return { value: a / b - 1, partial: false };
    return { value: null, partial: false };
  }
  // Partial current year → YTD vs prior December
  const last = lastIndexInYear(ds, year);
  if (decPrev >= 0 && last >= 0) {
    const a = ds.series[last];
    const b = ds.series[decPrev];
    if (a != null && b != null && b !== 0) return { value: a / b - 1, partial: true };
  }
  return { value: null, partial: false };
}

/** Year-to-date: P(last available) / P(Dec previous year) - 1. */
export function ytd(ds: DatedSeries): number | null {
  const lastIdx = (() => {
    for (let i = ds.series.length - 1; i >= 0; i--) if (ds.series[i] != null) return i;
    return -1;
  })();
  if (lastIdx < 0) return null;
  const curYear = yearOf(ds.dates[lastIdx]!);
  const decPrev = decemberIndex(ds, curYear - 1);
  if (decPrev < 0) return null;
  const a = ds.series[lastIdx];
  const b = ds.series[decPrev];
  if (a == null || b == null || b === 0) return null;
  return a / b - 1;
}

/** Discrete calendar years present, as {year, value, partial}. Last `count` years incl current. */
export function calendarYears(
  ds: DatedSeries,
  count = 9,
): { year: number; value: number | null; partial: boolean }[] {
  const years = [...new Set(ds.dates.map(yearOf))].sort((a, b) => a - b);
  const lastYear = years[years.length - 1];
  if (lastYear == null) return [];
  const out: { year: number; value: number | null; partial: boolean }[] = [];
  for (let y = lastYear - count + 1; y <= lastYear; y++) {
    out.push({ year: y, ...calendarYearReturn(ds, y) });
  }
  return out;
}

/** Quarter-end return: P(quarter-end)/P(prev quarter-end) - 1. Quarter-ends Mar/Jun/Sep/Dec. */
export function quarterlyReturns(
  ds: DatedSeries,
): { label: string; value: number | null }[] {
  const qEnds: { idx: number; label: string }[] = [];
  ds.dates.forEach((d, i) => {
    const m = monthOf(d);
    if ([3, 6, 9, 12].includes(m) && ds.series[i] != null) {
      const q = Math.ceil(m / 3);
      qEnds.push({ idx: i, label: `${yearOf(d)} Q${q}` });
    }
  });
  const out: { label: string; value: number | null }[] = [];
  for (let k = 1; k < qEnds.length; k++) {
    const cur = ds.series[qEnds[k]!.idx];
    const prev = ds.series[qEnds[k - 1]!.idx];
    out.push({
      label: qEnds[k]!.label,
      value: cur != null && prev != null && prev !== 0 ? cur / prev - 1 : null,
    });
  }
  return out;
}
