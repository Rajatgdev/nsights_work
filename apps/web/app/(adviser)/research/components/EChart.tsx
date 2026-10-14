'use client';

/**
 * Chart renderer for the Research surface. Builds a dark-theme ECharts option
 * from the server's chart `data` payload (no import of @nsights/charts in the
 * browser — keeps calc out of the client bundle). Table-kind charts render as
 * HTML tables elsewhere; this handles line + bar.
 */
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ChartPayload } from '../lib/api';

const THEME = {
  text: '#93a1ab',
  textStrong: '#e8eef2',
  grid: 'rgba(255,255,255,0.06)',
  axis: 'rgba(255,255,255,0.14)',
};

interface LineData {
  dates: string[];
  series: { name: string; colour: string; values: (number | null)[] }[];
}
interface BarBucketData {
  buckets: { key: string; label: string }[];
  rows: { name: string; colour: string; values: Record<string, number | null> }[];
}
interface BarYearData {
  years: number[];
  rows: { name: string; colour: string; values: (number | null)[] }[];
}

function axisCommon() {
  return {
    axisLine: { lineStyle: { color: THEME.axis } },
    axisTick: { show: false },
    axisLabel: { color: THEME.text, fontSize: 11 },
    splitLine: { lineStyle: { color: THEME.grid } },
  };
}

function baseOption(legend: string[], colours: string[]) {
  return {
    color: colours,
    textStyle: { fontFamily: 'system-ui, sans-serif' },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#1c2832',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: THEME.textStrong, fontSize: 12 },
    },
    legend: {
      data: legend,
      textStyle: { color: THEME.text, fontSize: 11 },
      top: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: { left: 52, right: 18, top: 34, bottom: 28, containLabel: true },
  };
}

function buildOption(payload: ChartPayload): Record<string, unknown> | null {
  const d = payload.data as unknown;

  if (payload.key === 'growth10k') {
    const g = d as LineData;
    return {
      ...baseOption(g.series.map((s) => s.name), g.series.map((s) => s.colour)),
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1c2832',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: THEME.textStrong, fontSize: 12 },
        valueFormatter: (v: number) => (v == null ? '—' : `€${v.toLocaleString('en-IE')}`),
      },
      xAxis: { type: 'category', boundaryGap: false, data: g.dates.map(shortDate), ...axisCommon() },
      yAxis: { type: 'value', scale: true, ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11, formatter: (v: number) => `€${Math.round(v / 1000)}k` } },
      series: g.series.map((s) => ({
        name: s.name, type: 'line', showSymbol: false, smooth: false,
        lineStyle: { width: 2 }, data: s.values,
      })),
    };
  }

  if (payload.key === 'cumulative5y' || payload.key === 'rolling2y') {
    const g = d as LineData;
    return {
      ...baseOption(g.series.map((s) => s.name), g.series.map((s) => s.colour)),
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1c2832',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: THEME.textStrong, fontSize: 12 },
        valueFormatter: (v: number) => (v == null ? '—' : `${v}%`),
      },
      xAxis: { type: 'category', boundaryGap: false, data: g.dates.map(shortDate), ...axisCommon() },
      yAxis: { type: 'value', ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11, formatter: '{value}%' } },
      series: g.series.map((s) => ({ name: s.name, type: 'line', showSymbol: false, lineStyle: { width: 2 }, data: s.values })),
    };
  }

  if (payload.key === 'stressDrawdown') {
    const g = d as { events: { id: string; label: string }[]; rows: { name: string; colour: string; values: Record<string, number | null> }[] };
    return {
      ...baseOption(g.rows.map((r) => r.name), g.rows.map((r) => r.colour)),
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1c2832',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: THEME.textStrong, fontSize: 12 },
        valueFormatter: (v: number) => (v == null ? '—' : `${v}%`),
      },
      grid: { left: 52, right: 18, top: 34, bottom: 56, containLabel: true },
      xAxis: { type: 'category', data: g.events.map((e) => e.label), ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 10.5, interval: 0, width: 80, overflow: 'break' } },
      yAxis: { type: 'value', ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11, formatter: '{value}%' } },
      series: g.rows.map((r) => ({ name: r.name, type: 'bar', data: g.events.map((e) => r.values[e.id] ?? null) })),
    };
  }

  if (payload.key === 'histMonthly' || payload.key === 'histQuarterly') {
    const g = d as { labels: string[]; series: { name: string; colour: string; buckets: { label: string; count: number }[] }[] };
    return {
      ...baseOption(g.series.map((s) => s.name), g.series.map((s) => s.colour)),
      tooltip: { trigger: 'axis', backgroundColor: '#1c2832', borderColor: 'rgba(255,255,255,0.12)', textStyle: { color: THEME.textStrong, fontSize: 12 } },
      grid: { left: 40, right: 18, top: 34, bottom: 52, containLabel: true },
      xAxis: { type: 'category', data: g.labels, ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 10.5, interval: 0, rotate: 30 } },
      yAxis: { type: 'value', ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11 } },
      series: g.series.map((s) => ({ name: s.name, type: 'bar', data: s.buckets.map((b) => b.count) })),
    };
  }

  if (payload.key === 'riskReturn') {
    const g = d as { points: { name: string; colour: string; x: number | null; y: number | null }[] };
    const pts = g.points.filter((p) => p.x != null && p.y != null);
    return {
      textStyle: { fontFamily: 'system-ui, sans-serif' },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1c2832',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: THEME.textStrong, fontSize: 12 },
        formatter: (p: { data: { value: [number, number]; name: string } }) =>
          `${p.data.name}<br/>vol ${p.data.value[0]}% · return ${p.data.value[1]}%`,
      },
      grid: { left: 52, right: 18, top: 20, bottom: 44, containLabel: true },
      xAxis: { type: 'value', name: '5y volatility %', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: THEME.text, fontSize: 11 }, ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11, formatter: '{value}%' } },
      yAxis: { type: 'value', name: '5y p.a. %', nameLocation: 'middle', nameGap: 38, nameTextStyle: { color: THEME.text, fontSize: 11 }, ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11, formatter: '{value}%' } },
      series: [{
        type: 'scatter', symbolSize: 14,
        data: pts.map((p) => ({ value: [p.x, p.y], name: p.name, itemStyle: { color: p.colour } })),
      }],
    };
  }

  if (payload.key === 'historicVol') {
    const g = d as LineData;
    return {
      ...baseOption(g.series.map((s) => s.name), g.series.map((s) => s.colour)),
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1c2832',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: THEME.textStrong, fontSize: 12 },
        valueFormatter: (v: number) => (v == null ? '—' : `${v}%`),
      },
      xAxis: { type: 'category', boundaryGap: false, data: g.dates.map(shortDate), ...axisCommon() },
      yAxis: { type: 'value', ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11, formatter: '{value}%' } },
      series: g.series.map((s) => ({
        name: s.name, type: 'line', showSymbol: false, lineStyle: { width: 2 }, data: s.values,
      })),
    };
  }

  if (payload.key === 'annualised') {
    const g = d as BarBucketData;
    return {
      ...baseOption(g.rows.map((r) => r.name), g.rows.map((r) => r.colour)),
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1c2832',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: THEME.textStrong, fontSize: 12 },
        valueFormatter: (v: number) => (v == null ? '—' : `${v}%`),
      },
      xAxis: { type: 'category', data: g.buckets.map((b) => b.label), ...axisCommon() },
      yAxis: { type: 'value', ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11, formatter: '{value}%' } },
      series: g.rows.map((r) => ({
        name: r.name, type: 'bar',
        data: g.buckets.map((b) => r.values[b.key] ?? null),
      })),
    };
  }

  if (payload.key === 'calendarYear') {
    const g = d as BarYearData;
    return {
      ...baseOption(g.rows.map((r) => r.name), g.rows.map((r) => r.colour)),
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1c2832',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: THEME.textStrong, fontSize: 12 },
        valueFormatter: (v: number) => (v == null ? '—' : `${v}%`),
      },
      xAxis: { type: 'category', data: g.years.map(String), ...axisCommon() },
      yAxis: { type: 'value', ...axisCommon(), axisLabel: { color: THEME.text, fontSize: 11, formatter: '{value}%' } },
      series: g.rows.map((r) => ({ name: r.name, type: 'bar', data: r.values })),
    };
  }

  return null;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IE', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function EChart({ payload, height = 240 }: { payload: ChartPayload; height?: number }) {
  const option = useMemo(() => buildOption(payload), [payload]);
  if (!option) return null;
  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
      lazyUpdate
    />
  );
}
