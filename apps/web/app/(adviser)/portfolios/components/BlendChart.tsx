'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

const THEME = { text: '#93a1ab', grid: 'rgba(255,255,255,0.06)', axis: 'rgba(255,255,255,0.14)', accent: '#16a394' };

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IE', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/** Blended value of €10,000, rebased at the blend start. */
export function BlendChart({ dates, series, height = 280 }: { dates: string[]; series: (number | null)[]; height?: number }) {
  const option = useMemo(() => {
    // trim leading nulls so the axis starts at the blend start
    const first = series.findIndex((v) => v != null);
    const d = first >= 0 ? dates.slice(first) : dates;
    const s = first >= 0 ? series.slice(first) : series;
    return {
      color: [THEME.accent],
      textStyle: { fontFamily: 'system-ui, sans-serif' },
      tooltip: {
        trigger: 'axis', backgroundColor: '#1c2832', borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: '#e8eef2', fontSize: 12 },
        valueFormatter: (v: number) => (v == null ? '—' : `€${Math.round(v).toLocaleString('en-IE')}`),
      },
      grid: { left: 56, right: 18, top: 18, bottom: 28, containLabel: true },
      xAxis: {
        type: 'category', boundaryGap: false, data: d.map(shortDate),
        axisLine: { lineStyle: { color: THEME.axis } }, axisTick: { show: false },
        axisLabel: { color: THEME.text, fontSize: 11 }, splitLine: { show: false },
      },
      yAxis: {
        type: 'value', scale: true,
        axisLine: { show: false }, axisLabel: { color: THEME.text, fontSize: 11, formatter: (v: number) => `€${Math.round(v / 1000)}k` },
        splitLine: { lineStyle: { color: THEME.grid } },
      },
      series: [{ type: 'line', showSymbol: false, lineStyle: { width: 2 }, areaStyle: { color: 'rgba(22,163,148,0.08)' }, data: s }],
    };
  }, [dates, series]);

  return <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} notMerge lazyUpdate />;
}
