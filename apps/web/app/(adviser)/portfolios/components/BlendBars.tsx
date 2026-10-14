'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

const THEME = { text: '#93a1ab', grid: 'rgba(255,255,255,0.06)', axis: 'rgba(255,255,255,0.14)', accent: '#16a394' };

/** A compact bar chart of labelled percentage values (annualised, calendar-year). */
export function BlendBars({
  categories,
  values, // decimals (0.07 = 7%)
  height = 180,
}: {
  categories: string[];
  values: (number | null)[];
  height?: number;
}) {
  const option = useMemo(() => {
    const pct = values.map((v) => (v == null ? null : Math.round(v * 1000) / 10));
    return {
      textStyle: { fontFamily: 'system-ui, sans-serif' },
      tooltip: {
        trigger: 'axis', backgroundColor: '#1c2832', borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: '#e8eef2', fontSize: 12 },
        valueFormatter: (v: number) => (v == null ? '—' : `${v}%`),
      },
      grid: { left: 40, right: 14, top: 12, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category', data: categories,
        axisLine: { lineStyle: { color: THEME.axis } }, axisTick: { show: false },
        axisLabel: { color: THEME.text, fontSize: 10.5 },
      },
      yAxis: {
        type: 'value', axisLine: { show: false },
        axisLabel: { color: THEME.text, fontSize: 10.5, formatter: '{value}%' },
        splitLine: { lineStyle: { color: THEME.grid } },
      },
      series: [{
        type: 'bar',
        data: pct.map((v) => ({
          value: v,
          itemStyle: { color: v != null && v < 0 ? '#e2795f' : THEME.accent },
        })),
      }],
    };
  }, [categories, values]);

  return <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} notMerge lazyUpdate />;
}
