/**
 * Fund metric bundle assembler (build spec §6).
 *
 * computeFundMetrics() runs the full §6 metric set for one fund's price series
 * and returns the JSON object stored in fund_metric.metrics. The recalculate
 * job calls this per fund.
 */
import {
    ANNUALISED_WINDOWS_MONTHS,
    STRESS_EVENTS,
  } from '@nsights/shared';
  import {
    type Series,
    monthlyReturns,
    totalReturn,
    annualised,
    sinceLaunchAnnualised,
    volatility,
    maxDrawdown,
    sharpe,
    firstIndex,
    lastIndex,
  } from './primitives.js';
  import {
    type DatedSeries,
    ytd,
    calendarYears,
    quarterlyReturns,
  } from './calendar.js';
  import { monthlyHistogram, quarterlyHistogram, percentPositive } from './histogram.js';
  import { stressDrawdown } from './stress.js';
  
  export interface FundMetrics {
    ytd: number | null;
    r1: number | null; // 12m total
    r3: number | null; // 3y annualised
    r5: number | null;
    r7: number | null;
    r10: number | null;
    sinceLaunch: number | null;
    volFull: number | null;
    vol3y: number | null;
    vol5y: number | null;
    mddFull: number | null;
    mdd5y: number | null;
    sharpeFull: number | null;
    sharpe5y: number | null;
    calendarYears: { year: number; value: number | null; partial: boolean }[];
    quarterly: { label: string; value: number | null }[];
    histMonthly: { label: string; count: number }[];
    histQuarterly: { label: string; count: number }[];
    pctPositiveMonthly: number | null;
    stress: ReturnType<typeof stressDrawdown>[];
    firstMonth: string | null;
    lastMonth: string | null;
    monthsOfHistory: number;
  }
  
  export function computeFundMetrics(ds: DatedSeries): FundMetrics {
    const series: Series = ds.series;
    const f = firstIndex(series);
    const n = lastIndex(series);
  
    const rets = monthlyReturns(series).filter((r): r is number => r != null);
    const retsPctQuarterly = quarterlyReturns(ds)
      .map((q) => q.value)
      .filter((v): v is number => v != null);
  
    return {
      ytd: ytd(ds),
      r1: totalReturn(series, 12),
      r3: annualised(series, 36),
      r5: annualised(series, 60),
      r7: annualised(series, 84),
      r10: annualised(series, 120),
      sinceLaunch: sinceLaunchAnnualised(series),
      volFull: volatility(series),
      vol3y: volatility(series, 36),
      vol5y: volatility(series, 60),
      mddFull: maxDrawdown(series),
      mdd5y: maxDrawdown(series, 60),
      sharpeFull: rets.length >= 2 ? sharpe(series, rets.length) : null,
      sharpe5y: sharpe(series, 60),
      calendarYears: calendarYears(ds, 9),
      quarterly: quarterlyReturns(ds),
      histMonthly: monthlyHistogram(rets),
      histQuarterly: quarterlyHistogram(retsPctQuarterly),
      pctPositiveMonthly: percentPositive(rets),
      stress: STRESS_EVENTS.map((ev) => stressDrawdown(ds, ev)),
      firstMonth: f >= 0 ? (ds.dates[f] ?? null) : null,
      lastMonth: n >= 0 ? (ds.dates[n] ?? null) : null,
      monthsOfHistory: f >= 0 && n >= 0 ? n - f : 0,
    };
  }
  
  export { ANNUALISED_WINDOWS_MONTHS };