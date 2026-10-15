'use client';

import { useEffect, useState } from 'react';
import { EChart } from '../../research/components/EChart';
import { getChartData, type Slide, type TemplateId, type CompareMode, type ChartPayload } from '../lib/api';

/** Template look tokens for the 16:9 preview (mirrors @nsights/export THEMES). */
const TEMPLATES: Record<TemplateId, { bg: string; text: string; accent: string; band: string; titleFont: string }> = {
  boardroom: { bg: '#ffffff', text: '#0f1b2d', accent: '#16a394', band: '#0f1b2d', titleFont: 'system-ui, sans-serif' },
  editorial: { bg: '#faf6ef', text: '#2b2621', accent: '#b4532a', band: '#2b2621', titleFont: 'Georgia, serif' },
  monoline: { bg: '#ffffff', text: '#1a1a1a', accent: '#1a1a1a', band: '#e6e6e6', titleFont: 'system-ui, sans-serif' },
};

const TABLE_KINDS = new Set(['keyMetrics', 'comparisonSummary', 'charges', 'discreteAnnual']);

interface TableSpec { columns: { key: string; label: string; align?: 'left' | 'right' }[]; rows: Record<string, string | number | null>[] }

export function SlidePreview({
  slide, template, compareMode, firmName, clientName, adviserName, dataMonth,
}: {
  slide: Slide | null; template: TemplateId; compareMode: CompareMode;
  firmName: string; clientName: string | null; adviserName: string | null; dataMonth: string;
}) {
  const t = TEMPLATES[template];
  const [payload, setPayload] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slide || slide.kind !== 'chart' || !slide.chartKey || slide.fundIds.length === 0) { setPayload(null); return; }
    let cancelled = false;
    setLoading(true); setErr(null);
    getChartData(slide.chartKey, slide.fundIds, compareMode)
      .then((p) => { if (!cancelled) setPayload(p); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : 'Chart failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slide, compareMode]);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 720 }}>
      <div
        className="relative overflow-hidden rounded-md border border-[var(--line)]"
        style={{ aspectRatio: '16 / 9', background: t.bg, color: t.text, fontFamily: t.titleFont }}
      >
        {/* band */}
        <div className="absolute inset-x-0 top-0" style={{ height: 6, background: t.accent }} />
        {slide == null ? (
          <Centered><span style={{ opacity: 0.5 }}>No slide selected</span></Centered>
        ) : slide.kind === 'cover' ? (
          <div className="flex h-full flex-col justify-center px-10">
            <div className="text-xs uppercase tracking-widest" style={{ color: t.accent }}>{firmName}</div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight">{clientName ? `Portfolio review for ${clientName}` : 'Fund & portfolio review'}</h1>
            <div className="mt-4 text-sm" style={{ opacity: 0.7 }}>{adviserName ?? ''}{adviserName ? ' · ' : ''}Data as at {dataMonth}</div>
          </div>
        ) : slide.kind === 'disclaimer' ? (
          <div className="flex h-full flex-col justify-center px-10">
            <h2 className="text-lg font-semibold">Important information</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ opacity: 0.8 }}>
              Past performance is not a reliable indicator of future results. Figures are from monthly unit prices and are provided for information only; they do not constitute advice. Data as at {dataMonth}.
            </p>
          </div>
        ) : slide.kind === 'chart' ? (
          <div className="flex h-full flex-col px-8 py-6">
            <h2 className="text-lg font-semibold" style={{ color: t.text }}>{payload?.title ?? (slide.chartKey ? 'Loading…' : 'Choose a chart and funds')}</h2>
            <div className="min-h-0 flex-1">
              {!slide.chartKey || slide.fundIds.length === 0 ? (
                <Centered><span style={{ opacity: 0.4 }}>Pick a chart type and at least one fund</span></Centered>
              ) : loading ? (
                <Centered><span style={{ opacity: 0.5 }}>Loading…</span></Centered>
              ) : err ? (
                <Centered><span style={{ color: '#b4532a' }}>{err}</span></Centered>
              ) : payload ? (
                <ChartOrTable payload={payload} theme={t} />
              ) : null}
            </div>
            {payload ? <p className="text-[9px] leading-tight" style={{ opacity: 0.55 }}>{payload.footnote}</p> : null}
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center px-10">
            <h2 className="text-lg font-semibold capitalize">{slide.kind}</h2>
            <p className="mt-2 text-sm" style={{ opacity: 0.6 }}>This slide type is laid out by the template at export.</p>
          </div>
        )}
        {/* footer */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-6 py-1.5 text-[9px]" style={{ color: t.text, opacity: 0.6, borderTop: `1px solid ${t.band}22` }}>
          <span>{firmName}</span>
          <span>Data: {dataMonth} · Past performance is not a reliable indicator of future results.</span>
        </div>
      </div>
    </div>
  );
}

function ChartOrTable({ payload, theme }: { payload: ChartPayload; theme: { text: string; accent: string } }) {
  if (TABLE_KINDS.has(payload.key) || payload.kind === 'table') {
    const spec = payload.data as unknown as TableSpec;
    return (
      <div className="h-full overflow-auto pt-2">
        <table className="w-full text-[10px]" style={{ color: theme.text }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.text}22` }}>
              {spec.columns.map((c) => <th key={c.key} className={`px-2 py-1 ${c.align === 'right' ? 'text-right' : 'text-left'}`} style={{ opacity: 0.6 }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${theme.text}11` }}>
                {spec.columns.map((c) => <td key={c.key} className={`px-2 py-1 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{fmtCell(row[c.key] ?? null, c.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // The screen EChart is dark-themed; on a light template slide we show it in a
  // subtle dark inset so it stays legible. The EXPORT path (Stage 4) renders the
  // same chart server-side in the template's own palette — this is a preview.
  return (
    <div className="mt-1 h-[calc(100%-4px)] rounded" style={{ background: '#121922', padding: 6 }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <EChart payload={payload as any} height={248} />
    </div>
  );
}

const PCT = new Set(['ytd', 'r3', 'r5', 'r7', 'vol5y', 'mdd5y', 'amc', 'ocf']);
function fmtCell(v: string | number | null, key: string): string {
  if (v == null) return '—';
  if (typeof v !== 'number') return v;
  if (PCT.has(key) || /^y\d{4}$/.test(key)) return `${v}%`;
  if (key === 'costPer10k') return `€${v}`;
  return String(v);
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm">{children}</div>;
}
