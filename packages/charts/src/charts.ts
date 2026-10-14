/**
 * Launch chart definitions (spec §7). Core 6 for M3:
 *   growth10k · annualised · calendarYear · historicVol · keyMetrics · comparisonSummary
 *
 * Each ChartDef:
 *   data()     — pure transform of ChartContext → a JSON-able payload
 *   option()   — ECharts option (line/bar) or TableSpec (table), for screen + SSR
 *   facts()    — rounded numbers fed to AI commentary + the numbers validator
 *   fallback() — deterministic sentence if commentary fails validation
 *   footnote() — window/basis line, ends with the locked disclaimer
 *
 * Windowing honours compareMode (common vs own) via windowed().
 */
import {
    rebase,
    annualised as annualisedReturn,
    volatility,
    rollingVolatility,
    maxDrawdown,
    sharpe,
    ytd as ytdReturn,
    calendarYears as calcCalendarYears,
  } from '@nsights/calc';
  import type { ChartContext, ChartDef, ChartData, ChartTheme } from './registry.js';
  import { standardFootnote } from './footnote.js';
  import { windowed, windowLabel, pct, round, colourFor } from './_util.js';
  
  function dataMonthOf(ctx: ChartContext): string {
    const d = ctx.funds[0]?.dates;
    return d?.[d.length - 1] ?? '';
  }
  
  // ── TableSpec (for table-kind charts) ────────────────────────
  export interface TableSpec {
    columns: { key: string; label: string; align?: 'left' | 'right' }[];
    rows: Record<string, string | number | null>[];
    /** row id to highlight as "best" (optional). */
    highlightRowId?: string;
  }
  
  // Shared axis styling for line/bar.
  function baseAxis(theme: ChartTheme) {
    return {
      axisLine: { lineStyle: { color: theme.gridColor } },
      axisLabel: { color: theme.textColor },
      splitLine: { lineStyle: { color: theme.gridColor } },
    };
  }
  
  // ── 1. growth10k — rebase to €10,000 over the window (line) ──
  const growth10k: ChartDef = {
    key: 'growth10k',
    kind: 'line',
    title: (ctx) =>
      `Growth of €10,000${ctx.compareMode === 'common' ? ' (common period)' : ''}`,
    data: (ctx): ChartData => {
      const { funds, dates } = windowed(ctx);
      return {
        dates,
        series: funds.map((f) => ({
          id: f.id,
          name: f.name,
          colour: f.colour,
          values: rebase(f.series, 10_000).map((v) => (v == null ? null : round(v, 0))),
        })),
      };
    },
    option: (data, theme) => {
      const d = data as { dates: string[]; series: { name: string; colour: string; values: (number | null)[] }[] };
      return {
        color: d.series.map((s) => s.colour),
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => `€${v?.toLocaleString?.() ?? v}` },
        legend: { data: d.series.map((s) => s.name), textStyle: { color: theme.textColor } },
        grid: { left: 56, right: 24, top: 36, bottom: 40 },
        xAxis: { type: 'category', data: d.dates, ...baseAxis(theme) },
        yAxis: { type: 'value', scale: true, ...baseAxis(theme), axisLabel: { color: theme.textColor, formatter: (v: number) => `€${(v / 1000).toFixed(0)}k` } },
        series: d.series.map((s) => ({ name: s.name, type: 'line', showSymbol: false, smooth: false, data: s.values })),
      };
    },
    pptx: () => 'image',
    facts: (data) => {
      const d = data as { series: { name: string; values: (number | null)[] }[] };
      const out: Record<string, number | string> = {};
      for (const s of d.series) {
        const last = [...s.values].reverse().find((v) => v != null);
        if (last != null) out[`final_${s.name}`] = last;
      }
      return out;
    },
    fallback: (facts) => {
      const entries = Object.entries(facts).filter(([k]) => k.startsWith('final_'));
      if (entries.length === 0) return 'Growth of €10,000 over the period shown.';
      const parts = entries.map(([k, v]) => `${k.replace('final_', '')} ended at €${v}`);
      return `Starting from €10,000: ${parts.join('; ')}.`;
    },
    footnote: (ctx) =>
      standardFootnote({ dataMonth: dataMonthOf(ctx), window: windowLabel(ctx) }),
  };
  
  // ── 2. annualised — YTD, 3/5/7/10y p.a. (grouped bar) ──
  const annualised: ChartDef = {
    key: 'annualised',
    kind: 'bar',
    title: () => 'Annualised returns',
    data: (ctx): ChartData => {
      const { funds } = windowed(ctx);
      const buckets = [
        { key: 'ytd', label: 'YTD' },
        { key: 'r3', label: '3y p.a.' },
        { key: 'r5', label: '5y p.a.' },
        { key: 'r7', label: '7y p.a.' },
        { key: 'r10', label: '10y p.a.' },
      ];
      const rows = funds.map((f) => {
        const ds = { dates: f.dates, series: f.series };
        return {
          id: f.id,
          name: f.name,
          colour: f.colour,
          values: {
            ytd: pct(ytdReturn(ds)),
            r3: pct(annualisedReturn(f.series, 36)),
            r5: pct(annualisedReturn(f.series, 60)),
            r7: pct(annualisedReturn(f.series, 84)),
            r10: pct(annualisedReturn(f.series, 120)),
          } as Record<string, number | null>,
        };
      });
      return { buckets, rows };
    },
    option: (data, theme) => {
      const d = data as {
        buckets: { key: string; label: string }[];
        rows: { name: string; colour: string; values: Record<string, number | null> }[];
      };
      return {
        color: d.rows.map((r) => r.colour),
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : `${v}%`) },
        legend: { data: d.rows.map((r) => r.name), textStyle: { color: theme.textColor } },
        grid: { left: 48, right: 24, top: 36, bottom: 40 },
        xAxis: { type: 'category', data: d.buckets.map((b) => b.label), ...baseAxis(theme) },
        yAxis: { type: 'value', ...baseAxis(theme), axisLabel: { color: theme.textColor, formatter: '{value}%' } },
        series: d.rows.map((r) => ({
          name: r.name,
          type: 'bar',
          data: d.buckets.map((b) => r.values[b.key] ?? null),
        })),
      };
    },
    pptx: () => 'image',
    facts: (data) => {
      const d = data as { rows: { name: string; values: Record<string, number | null> }[] };
      const out: Record<string, number | string> = {};
      for (const r of d.rows) {
        for (const [k, v] of Object.entries(r.values)) {
          if (v != null) out[`${r.name}_${k}`] = v;
        }
      }
      return out;
    },
    fallback: (facts) => {
      const r5 = Object.entries(facts).filter(([k]) => k.endsWith('_r5'));
      if (r5.length === 0) return 'Annualised returns over the standard windows.';
      return `Five-year annualised returns: ${r5.map(([k, v]) => `${k.replace('_r5', '')} ${v}%`).join('; ')}.`;
    },
    footnote: (ctx) =>
      standardFootnote({ dataMonth: dataMonthOf(ctx), window: windowLabel(ctx) }),
  };
  
  // ── 3. calendarYear — last 9 calendar years incl YTD (grouped bar) ──
  const calendarYear: ChartDef = {
    key: 'calendarYear',
    kind: 'bar',
    title: () => 'Calendar-year returns',
    data: (ctx): ChartData => {
      // calendar years use each fund's OWN dates (never common-windowed — spec fix for year alignment).
      const years = new Set<number>();
      const perFund = ctx.funds.map((f, i) => {
        const cy = calcCalendarYears({ dates: f.dates, series: f.series }, 9);
        cy.forEach((y) => years.add(y.year));
        return { id: f.id, name: f.name, colour: colourFor(f.name, i), cy };
      });
      const sortedYears = [...years].sort((a, b) => a - b);
      const rows = perFund.map((f) => {
        const byYear = new Map(f.cy.map((y) => [y.year, y.value]));
        return {
          id: f.id,
          name: f.name,
          colour: f.colour,
          values: sortedYears.map((y) => pct(byYear.get(y) ?? null)),
        };
      });
      return { years: sortedYears, rows };
    },
    option: (data, theme) => {
      const d = data as {
        years: number[];
        rows: { name: string; colour: string; values: (number | null)[] }[];
      };
      return {
        color: d.rows.map((r) => r.colour),
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : `${v}%`) },
        legend: { data: d.rows.map((r) => r.name), textStyle: { color: theme.textColor } },
        grid: { left: 48, right: 24, top: 36, bottom: 40 },
        xAxis: { type: 'category', data: d.years.map(String), ...baseAxis(theme) },
        yAxis: { type: 'value', ...baseAxis(theme), axisLabel: { color: theme.textColor, formatter: '{value}%' } },
        series: d.rows.map((r) => ({ name: r.name, type: 'bar', data: r.values })),
      };
    },
    pptx: () => 'image',
    facts: (data) => {
      const d = data as { years: number[]; rows: { name: string; values: (number | null)[] }[] };
      const out: Record<string, number | string> = {};
      for (const r of d.rows) {
        d.years.forEach((y, i) => {
          const v = r.values[i];
          if (v != null) out[`${r.name}_${y}`] = v;
        });
      }
      return out;
    },
    fallback: (facts) => {
      const keys = Object.keys(facts);
      if (keys.length === 0) return 'Calendar-year returns for the funds shown.';
      return `Calendar-year returns shown for ${new Set(keys.map((k) => k.split('_')[0])).size} fund(s).`;
    },
    footnote: (ctx) =>
      standardFootnote({ dataMonth: dataMonthOf(ctx), window: 'calendar years, each fund\u2019s own history' }),
  };
  
  // ── 4. historicVol — rolling 12m annualised vol (line) ──
  const historicVol: ChartDef = {
    key: 'historicVol',
    kind: 'line',
    title: () => 'Historic volatility (rolling 12-month)',
    data: (ctx): ChartData => {
      const { funds, dates } = windowed(ctx);
      return {
        dates,
        series: funds.map((f) => ({
          id: f.id,
          name: f.name,
          colour: f.colour,
          values: rollingVolatility(f.series, 12).map((v) => pct(v)),
        })),
      };
    },
    option: (data, theme) => {
      const d = data as { dates: string[]; series: { name: string; colour: string; values: (number | null)[] }[] };
      return {
        color: d.series.map((s) => s.colour),
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : `${v}%`) },
        legend: { data: d.series.map((s) => s.name), textStyle: { color: theme.textColor } },
        grid: { left: 48, right: 24, top: 36, bottom: 40 },
        xAxis: { type: 'category', data: d.dates, ...baseAxis(theme) },
        yAxis: { type: 'value', ...baseAxis(theme), axisLabel: { color: theme.textColor, formatter: '{value}%' } },
        series: d.series.map((s) => ({ name: s.name, type: 'line', showSymbol: false, data: s.values })),
      };
    },
    pptx: () => 'image',
    facts: (data) => {
      const d = data as { series: { name: string; values: (number | null)[] }[] };
      const out: Record<string, number | string> = {};
      for (const s of d.series) {
        const last = [...s.values].reverse().find((v) => v != null);
        if (last != null) out[`vol_${s.name}`] = last;
      }
      return out;
    },
    fallback: (facts) => {
      const e = Object.entries(facts);
      if (e.length === 0) return 'Rolling 12-month annualised volatility.';
      return `Latest rolling 12-month volatility: ${e.map(([k, v]) => `${k.replace('vol_', '')} ${v}%`).join('; ')}.`;
    },
    footnote: (ctx) =>
      standardFootnote({ dataMonth: dataMonthOf(ctx), window: 'rolling 12-month, annualised' }),
  };
  
  // ── 5. keyMetrics — risk/return table ──
  const keyMetrics: ChartDef = {
    key: 'keyMetrics',
    kind: 'table',
    title: () => 'Key metrics',
    data: (ctx): ChartData => {
      const { funds } = windowed(ctx);
      const rows = funds.map((f) => {
        const s = f.series;
        return {
          id: f.id,
          fund: f.name,
          r5: pct(annualisedReturn(s, 60)),
          r7: pct(annualisedReturn(s, 84)),
          vol5y: pct(volatility(s, 60)),
          sharpe5y: round(sharpe(s, 60), 2),
          mdd5y: pct(maxDrawdown(s, 60)),
        };
      });
      let best: string | undefined;
      let bestVal = -Infinity;
      for (const r of rows) {
        if (r.r5 != null && r.r5 > bestVal) { bestVal = r.r5; best = r.id; }
      }
      const spec: TableSpec = {
        columns: [
          { key: 'fund', label: 'Fund', align: 'left' },
          { key: 'r5', label: '5y p.a. %', align: 'right' },
          { key: 'r7', label: '7y p.a. %', align: 'right' },
          { key: 'vol5y', label: 'Vol 5y %', align: 'right' },
          { key: 'sharpe5y', label: 'Sharpe 5y', align: 'right' },
          { key: 'mdd5y', label: 'Max DD 5y %', align: 'right' },
        ],
        rows: rows.map((r) => ({ id: r.id, fund: r.fund, r5: r.r5, r7: r.r7, vol5y: r.vol5y, sharpe5y: r.sharpe5y, mdd5y: r.mdd5y })),
        highlightRowId: best,
      };
      return spec as unknown as ChartData;
    },
    option: (data) => data,
    pptx: () => 'image',
    facts: (data) => {
      const spec = data as unknown as TableSpec;
      const out: Record<string, number | string> = {};
      for (const r of spec.rows) {
        if (r.r5 != null) out[`${r.fund}_r5`] = r.r5 as number;
        if (r.sharpe5y != null) out[`${r.fund}_sharpe5y`] = r.sharpe5y as number;
      }
      return out;
    },
    fallback: (facts) => {
      const r5 = Object.entries(facts).filter(([k]) => k.endsWith('_r5'));
      if (r5.length === 0) return 'Key risk and return metrics over five years.';
      return `Five-year annualised: ${r5.map(([k, v]) => `${k.replace('_r5', '')} ${v}%`).join('; ')}.`;
    },
    footnote: (ctx) =>
      standardFootnote({ dataMonth: dataMonthOf(ctx), window: '5-year window; Sharpe at rf 0%' }),
  };
  
  // ── 6. comparisonSummary — returns + risk table ──
  const comparisonSummary: ChartDef = {
    key: 'comparisonSummary',
    kind: 'table',
    title: () => 'Comparison summary',
    data: (ctx): ChartData => {
      const { funds } = windowed(ctx);
      const rows = funds.map((f) => {
        const s = f.series;
        return {
          id: f.id,
          fund: f.name,
          ytd: pct(ytdReturn({ dates: f.dates, series: s })),
          r3: pct(annualisedReturn(s, 36)),
          r5: pct(annualisedReturn(s, 60)),
          r7: pct(annualisedReturn(s, 84)),
          vol5y: pct(volatility(s, 60)),
          sharpe5y: round(sharpe(s, 60), 2),
          mdd5y: pct(maxDrawdown(s, 60)),
        };
      });
      const spec: TableSpec = {
        columns: [
          { key: 'fund', label: 'Fund', align: 'left' },
          { key: 'ytd', label: 'YTD %', align: 'right' },
          { key: 'r3', label: '3y %', align: 'right' },
          { key: 'r5', label: '5y %', align: 'right' },
          { key: 'r7', label: '7y %', align: 'right' },
          { key: 'vol5y', label: 'Vol 5y %', align: 'right' },
          { key: 'sharpe5y', label: 'Sharpe', align: 'right' },
          { key: 'mdd5y', label: 'Max DD %', align: 'right' },
        ],
        rows: rows.map((r) => ({
          id: r.id, fund: r.fund, ytd: r.ytd, r3: r.r3, r5: r.r5, r7: r.r7,
          vol5y: r.vol5y, sharpe5y: r.sharpe5y, mdd5y: r.mdd5y,
        })),
      };
      return spec as unknown as ChartData;
    },
    option: (data) => data,
    pptx: () => 'image',
    facts: (data) => {
      const spec = data as unknown as TableSpec;
      const out: Record<string, number | string> = {};
      for (const r of spec.rows) {
        for (const k of ['ytd', 'r5', 'vol5y'] as const) {
          if (r[k] != null) out[`${r.fund}_${k}`] = r[k] as number;
        }
      }
      return out;
    },
    fallback: (facts) => {
      const ytd = Object.entries(facts).filter(([k]) => k.endsWith('_ytd'));
      if (ytd.length === 0) return 'Side-by-side comparison of returns and risk.';
      return `Year-to-date: ${ytd.map(([k, v]) => `${k.replace('_ytd', '')} ${v}%`).join('; ')}.`;
    },
    footnote: (ctx) =>
      standardFootnote({ dataMonth: dataMonthOf(ctx), window: windowLabel(ctx) }),
  };
  
  export const CORE_CHARTS: ChartDef[] = [
    growth10k,
    annualised,
    calendarYear,
    historicVol,
    keyMetrics,
    comparisonSummary,
  ];