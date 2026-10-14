/**
 * Remaining launch charts (spec §7), completing the 14-chart set alongside
 * charts.ts' core 6:
 *   cumulative5y · discreteAnnual · rolling2y · stressDrawdown ·
 *   histMonthly · histQuarterly · riskReturn · charges
 *
 * Same ChartDef contract (data/option/facts/fallback/footnote), same windowing.
 */
import {
  rollingCumulative,
  annualised as annualisedReturn,
  volatility,
  stressDrawdown,
  monthlyReturns,
  quarterlyReturns,
  monthlyHistogram,
  quarterlyHistogram,
  calendarYears as calcCalendarYears,
} from '@nsights/calc';
import { STRESS_EVENTS } from '@nsights/shared';
import type { ChartContext, ChartDef, ChartData, ChartTheme } from './registry.js';
import type { TableSpec } from './charts.js';
import { standardFootnote } from './footnote.js';
import { windowed, windowLabel, pct, round, colourFor } from './_util.js';

function dataMonthOf(ctx: ChartContext): string {
  const d = ctx.funds[0]?.dates;
  return d?.[d.length - 1] ?? '';
}

function baseAxis(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.gridColor } },
    axisLabel: { color: theme.textColor },
    splitLine: { lineStyle: { color: theme.gridColor } },
  };
}

// ── cumulative5y — cumulative % over last 60 months (line) ──
const cumulative5y: ChartDef = {
  key: 'cumulative5y',
  kind: 'line',
  title: () => 'Cumulative return (5 years)',
  data: (ctx): ChartData => {
    const { funds, dates } = windowed(ctx);
    // last 60 points of the window
    const take = 60;
    const start = Math.max(0, dates.length - take);
    const slicedDates = dates.slice(start);
    return {
      dates: slicedDates,
      series: funds.map((f) => {
        const s = f.series.slice(start);
        const base = s.find((v) => v != null) ?? null;
        return {
          id: f.id,
          name: f.name,
          colour: f.colour,
          values: s.map((v) => (v == null || base == null || base === 0 ? null : pct(v / base - 1))),
        };
      }),
    };
  },
  option: (data, theme) => lineOption(data, theme, (v) => `${v}%`),
  pptx: () => 'image',
  facts: (data) => lastValueFacts(data, 'cum_'),
  fallback: (facts) => sentenceFromFacts(facts, 'cum_', 'Cumulative 5-year return', '%'),
  footnote: (ctx) => standardFootnote({ dataMonth: dataMonthOf(ctx), window: 'last 60 months' }),
};

// ── rolling2y — rolling 24m cumulative (line) ──
const rolling2y: ChartDef = {
  key: 'rolling2y',
  kind: 'line',
  title: () => 'Rolling 2-year return',
  data: (ctx): ChartData => {
    const { funds, dates } = windowed(ctx);
    return {
      dates,
      series: funds.map((f) => ({
        id: f.id,
        name: f.name,
        colour: f.colour,
        values: rollingCumulative(f.series, 24).map((v) => pct(v)),
      })),
    };
  },
  option: (data, theme) => lineOption(data, theme, (v) => `${v}%`),
  pptx: () => 'image',
  facts: (data) => lastValueFacts(data, 'r2y_'),
  fallback: (facts) => sentenceFromFacts(facts, 'r2y_', 'Latest rolling 2-year return', '%'),
  footnote: (ctx) => standardFootnote({ dataMonth: dataMonthOf(ctx), window: 'rolling 24-month' }),
};

// ── stressDrawdown — drawdown per stress event (grouped bar) ──
const stressDrawdownChart: ChartDef = {
  key: 'stressDrawdown',
  kind: 'bar',
  title: () => 'Drawdown through stress events',
  data: (ctx): ChartData => {
    // each fund's own history (events are absolute dates, not window-relative)
    const events = STRESS_EVENTS.map((e) => ({ id: e.id, label: e.label }));
    const rows = ctx.funds.map((f, i) => {
      const ds = { dates: f.dates, series: f.series };
      const byEvent: Record<string, number | null> = {};
      for (const ev of STRESS_EVENTS) {
        const r = stressDrawdown(ds, ev);
        byEvent[ev.id] = pct(r.drawdown);
      }
      return { id: f.id, name: f.name, colour: colourFor(f.name, i), values: byEvent };
    });
    return { events, rows };
  },
  option: (data, theme) => {
    const d = data as {
      events: { id: string; label: string }[];
      rows: { name: string; colour: string; values: Record<string, number | null> }[];
    };
    return {
      color: d.rows.map((r) => r.colour),
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : `${v}%`) },
      legend: { data: d.rows.map((r) => r.name), textStyle: { color: theme.textColor } },
      grid: { left: 48, right: 24, top: 36, bottom: 56 },
      xAxis: { type: 'category', data: d.events.map((e) => e.label), ...baseAxis(theme), axisLabel: { color: theme.textColor, interval: 0, width: 90, overflow: 'break' } },
      yAxis: { type: 'value', ...baseAxis(theme), axisLabel: { color: theme.textColor, formatter: '{value}%' } },
      series: d.rows.map((r) => ({ name: r.name, type: 'bar', data: d.events.map((e) => r.values[e.id] ?? null) })),
    };
  },
  pptx: () => 'image',
  facts: (data) => {
    const d = data as { events: { id: string; label: string }[]; rows: { name: string; values: Record<string, number | null> }[] };
    const out: Record<string, number | string> = {};
    for (const r of d.rows) for (const e of d.events) { const v = r.values[e.id]; if (v != null) out[`${r.name}_${e.id}`] = v; }
    return out;
  },
  fallback: (facts) => {
    const keys = Object.keys(facts);
    if (keys.length === 0) return 'Drawdown through historical stress events.';
    return `Stress-event drawdowns shown for ${new Set(keys.map((k) => k.split('_')[0])).size} fund(s).`;
  },
  footnote: (ctx) => standardFootnote({ dataMonth: dataMonthOf(ctx), window: 'peak-to-trough within each event window' }),
};

// ── histMonthly — monthly return bucket counts (bar/unit-box) ──
const histMonthly: ChartDef = {
  key: 'histMonthly',
  kind: 'unitbox',
  title: () => 'Monthly return distribution',
  data: (ctx): ChartData => histData(ctx, 'monthly'),
  option: (data, theme) => histOption(data, theme),
  pptx: () => 'image',
  facts: (data) => histFacts(data),
  fallback: () => 'Distribution of monthly returns by bucket.',
  footnote: (ctx) => standardFootnote({ dataMonth: dataMonthOf(ctx), window: windowLabel(ctx) }),
};

// ── histQuarterly — quarterly return bucket counts ──
const histQuarterly: ChartDef = {
  key: 'histQuarterly',
  kind: 'unitbox',
  title: () => 'Quarterly return distribution',
  data: (ctx): ChartData => histData(ctx, 'quarterly'),
  option: (data, theme) => histOption(data, theme),
  pptx: () => 'image',
  facts: (data) => histFacts(data),
  fallback: () => 'Distribution of quarterly returns by bucket.',
  footnote: (ctx) => standardFootnote({ dataMonth: dataMonthOf(ctx), window: windowLabel(ctx) }),
};

// ── riskReturn — scatter: x = 5y vol, y = 5y p.a. (same window) ──
const riskReturn: ChartDef = {
  key: 'riskReturn',
  kind: 'scatter',
  title: () => 'Risk vs return (5-year)',
  data: (ctx): ChartData => {
    const { funds } = windowed(ctx);
    const points = funds.map((f) => {
      const ann = annualisedReturn(f.series, 60);
      const vol = volatility(f.series, 60);
      return {
        id: f.id,
        name: f.name,
        colour: f.colour,
        x: pct(vol),
        y: pct(ann),
        excluded: ann == null || vol == null, // < 5y history
      };
    });
    return { points };
  },
  option: (data, theme) => {
    const d = data as { points: { name: string; colour: string; x: number | null; y: number | null }[] };
    const pts = d.points.filter((p) => p.x != null && p.y != null);
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: { data: [number, number, string] }) =>
          `${p.data[2]}<br/>vol ${p.data[0]}% · return ${p.data[1]}%`,
      },
      grid: { left: 52, right: 24, top: 24, bottom: 44, containLabel: true },
      xAxis: { type: 'value', name: '5y volatility %', nameLocation: 'middle', nameGap: 28, ...baseAxis(theme), axisLabel: { color: theme.textColor, formatter: '{value}%' } },
      yAxis: { type: 'value', name: '5y p.a. %', nameLocation: 'middle', nameGap: 36, ...baseAxis(theme), axisLabel: { color: theme.textColor, formatter: '{value}%' } },
      series: [{
        type: 'scatter', symbolSize: 14,
        data: pts.map((p) => ({ value: [p.x, p.y, p.name], itemStyle: { color: p.colour } })),
      }],
    };
  },
  pptx: () => 'image',
  facts: (data) => {
    const d = data as { points: { name: string; x: number | null; y: number | null }[] };
    const out: Record<string, number | string> = {};
    for (const p of d.points) { if (p.x != null) out[`${p.name}_vol`] = p.x; if (p.y != null) out[`${p.name}_ret`] = p.y; }
    return out;
  },
  fallback: (facts) => {
    const n = new Set(Object.keys(facts).map((k) => k.replace(/_(vol|ret)$/, ''))).size;
    return `Risk-return positioning over five years for ${n} fund(s). Funds with under five years of history are excluded.`;
  },
  footnote: (ctx) => standardFootnote({ dataMonth: dataMonthOf(ctx), window: '5-year window; funds with <5y history excluded' }),
};

// ── charges — AMC, OCF, cost per €10k (table) ──
const charges: ChartDef = {
  key: 'charges',
  kind: 'table',
  title: () => 'Charges',
  data: (ctx): ChartData => {
    const rows = ctx.funds.map((f) => {
      const ocf = f.facts?.ongoingChargePct ?? null;
      const amc = f.facts?.amcPct ?? null;
      const costPer10k = ocf != null ? round(ocf * 100, 0) : null; // €/yr per €10,000 = OCF% × 100
      return { id: f.id, fund: f.name, amc, ocf, costPer10k };
    });
    const spec: TableSpec = {
      columns: [
        { key: 'fund', label: 'Fund', align: 'left' },
        { key: 'amc', label: 'AMC %', align: 'right' },
        { key: 'ocf', label: 'OCF %', align: 'right' },
        { key: 'costPer10k', label: 'Cost per €10k /yr', align: 'right' },
      ],
      rows: rows.map((r) => ({ id: r.id, fund: r.fund, amc: r.amc, ocf: r.ocf, costPer10k: r.costPer10k })),
    };
    return spec as unknown as ChartData;
  },
  option: (data) => data,
  pptx: () => 'image',
  facts: (data) => {
    const spec = data as unknown as TableSpec;
    const out: Record<string, number | string> = {};
    for (const r of spec.rows) if (r.ocf != null) out[`${r.fund}_ocf`] = r.ocf as number;
    return out;
  },
  fallback: (facts) => {
    const e = Object.entries(facts);
    if (e.length === 0) return 'Annual charges per fund.';
    return `Ongoing charges: ${e.map(([k, v]) => `${k.replace('_ocf', '')} ${v}%`).join('; ')}.`;
  },
  footnote: (ctx) => standardFootnote({ dataMonth: dataMonthOf(ctx), window: 'cost per €10,000 per year = OCF% × 100' }),
};

// ── discreteAnnual — same data as calendarYear, as a table ──
const discreteAnnual: ChartDef = {
  key: 'discreteAnnual',
  kind: 'table',
  title: () => 'Discrete annual returns',
  data: (ctx): ChartData => {
    const years = new Set<number>();
    const perFund = ctx.funds.map((f) => {
      const cy = calcCalendarYears({ dates: f.dates, series: f.series }, 9);
      cy.forEach((y) => years.add(y.year));
      return { id: f.id, name: f.name, byYear: new Map(cy.map((y) => [y.year, y.value])) };
    });
    const sortedYears = [...years].sort((a, b) => a - b);
    const spec: TableSpec = {
      columns: [
        { key: 'fund', label: 'Fund', align: 'left' },
        ...sortedYears.map((y) => ({ key: `y${y}`, label: String(y), align: 'right' as const })),
      ],
      rows: perFund.map((f) => {
        const row: Record<string, string | number | null> = { id: f.id, fund: f.name };
        for (const y of sortedYears) row[`y${y}`] = pct(f.byYear.get(y) ?? null);
        return row;
      }),
    };
    return spec as unknown as ChartData;
  },
  option: (data) => data,
  pptx: () => 'image',
  facts: (data) => {
    const spec = data as unknown as TableSpec;
    const out: Record<string, number | string> = {};
    for (const r of spec.rows) for (const c of spec.columns) {
      if (c.key === 'fund') continue;
      const v = r[c.key];
      if (typeof v === 'number') out[`${r.fund}_${c.label}`] = v;
    }
    return out;
  },
  fallback: () => 'Discrete calendar-year returns per fund.',
  footnote: (ctx) => standardFootnote({ dataMonth: dataMonthOf(ctx), window: 'calendar years, each fund’s own history' }),
};

// ── shared helpers for the line/hist/fact charts above ──

function lineOption(data: ChartData, theme: ChartTheme, fmt: (v: number) => string) {
  const d = data as { dates: string[]; series: { name: string; colour: string; values: (number | null)[] }[] };
  return {
    color: d.series.map((s) => s.colour),
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : fmt(v)) },
    legend: { data: d.series.map((s) => s.name), textStyle: { color: theme.textColor } },
    grid: { left: 48, right: 24, top: 36, bottom: 40 },
    xAxis: { type: 'category', boundaryGap: false, data: d.dates, ...baseAxis(theme) },
    yAxis: { type: 'value', ...baseAxis(theme), axisLabel: { color: theme.textColor, formatter: '{value}%' } },
    series: d.series.map((s) => ({ name: s.name, type: 'line', showSymbol: false, data: s.values })),
  };
}

function lastValueFacts(data: ChartData, prefix: string): Record<string, number | string> {
  const d = data as { series: { name: string; values: (number | null)[] }[] };
  const out: Record<string, number | string> = {};
  for (const s of d.series) {
    const last = [...s.values].reverse().find((v) => v != null);
    if (last != null) out[`${prefix}${s.name}`] = last;
  }
  return out;
}

function sentenceFromFacts(facts: Record<string, number | string>, prefix: string, lead: string, unit: string): string {
  const e = Object.entries(facts);
  if (e.length === 0) return `${lead}.`;
  return `${lead}: ${e.map(([k, v]) => `${k.replace(prefix, '')} ${v}${unit}`).join('; ')}.`;
}

function histData(ctx: ChartContext, kind: 'monthly' | 'quarterly'): ChartData {
  const { funds } = windowed(ctx);
  // single-fund histogram reads cleanest; for multi, overlay buckets per fund.
  const series = funds.map((f, i) => {
    const ds = { dates: f.dates, series: f.series };
    let buckets: { label: string; count: number }[];
    if (kind === 'monthly') {
      const rets = monthlyReturns(f.series).filter((r): r is number => r != null);
      buckets = monthlyHistogram(rets);
    } else {
      const qr = quarterlyReturns(ds).map((q) => q.value).filter((v): v is number => v != null);
      buckets = quarterlyHistogram(qr);
    }
    return { id: f.id, name: f.name, colour: colourFor(f.name, i), buckets };
  });
  const labels = series[0]?.buckets.map((b) => b.label) ?? [];
  return { labels, series };
}

function histOption(data: ChartData, theme: ChartTheme) {
  const d = data as {
    labels: string[];
    series: { name: string; colour: string; buckets: { label: string; count: number }[] }[];
  };
  return {
    color: d.series.map((s) => s.colour),
    tooltip: { trigger: 'axis' },
    legend: { data: d.series.map((s) => s.name), textStyle: { color: theme.textColor } },
    grid: { left: 40, right: 24, top: 36, bottom: 44 },
    xAxis: { type: 'category', data: d.labels, ...baseAxis(theme), axisLabel: { color: theme.textColor, interval: 0, rotate: 30 } },
    yAxis: { type: 'value', ...baseAxis(theme), axisLabel: { color: theme.textColor } },
    series: d.series.map((s) => ({ name: s.name, type: 'bar', data: s.buckets.map((b) => b.count) })),
  };
}

function histFacts(data: ChartData): Record<string, number | string> {
  const d = data as { series: { name: string; buckets: { label: string; count: number }[] }[] };
  const out: Record<string, number | string> = {};
  for (const s of d.series) {
    const total = s.buckets.reduce((a, b) => a + b.count, 0);
    out[`${s.name}_months`] = total;
  }
  return out;
}

export const EXT_CHARTS: ChartDef[] = [
  cumulative5y,
  rolling2y,
  stressDrawdownChart,
  histMonthly,
  histQuarterly,
  riskReturn,
  charges,
  discreteAnnual,
];
