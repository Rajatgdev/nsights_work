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
