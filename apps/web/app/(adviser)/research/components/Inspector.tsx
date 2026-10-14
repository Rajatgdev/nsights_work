'use client';

import { useEffect, useState } from 'react';
import {
  getFund, getChart, getSuggestions,
  type FundDetailResponse, type ChartPayload, type Suggestion, type CompareMode,
} from '../lib/api';
import { chargePct, historyLabel, monthYear, pctPlain, riskLabel, SFDR_LABEL } from '../lib/format';
import { EChart } from './EChart';

const SINGLE_CHARTS = [
  'growth10k', 'cumulative5y', 'annualised', 'calendarYear',
  'historicVol', 'rolling2y', 'stressDrawdown', 'histMonthly', 'charges',
] as const;

interface TableSpec {
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, string | number | null>[];
  highlightRowId?: string;
}

const PCT_COLS = new Set(['ytd', 'r3', 'r5', 'r7', 'vol5y', 'mdd5y']);
const CHARGE_COLS = new Set(['amc', 'ocf']);

function cellText(v: string | number | null, key: string): string {
  if (v == null) return '—';
  if (typeof v !== 'number') return v;
  if (PCT_COLS.has(key)) return `${v}%`;
  if (CHARGE_COLS.has(key)) return `${v}%`;
  if (key === 'costPer10k') return `€${v}`;
  return String(v);
}

function ChartTable({ payload }: { payload: ChartPayload }) {
  const spec = payload.data as unknown as TableSpec;
  return (
    <div className="overflow-x-auto rounded-sm border border-[var(--line)]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--surface)] text-[10.5px] uppercase tracking-wide text-[var(--ink-faint)]">
            {spec.columns.map((c) => (
              <th key={c.key} className={`px-2.5 py-1.5 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="border-b border-[var(--line-soft)]">
              {spec.columns.map((c) => {
                const v = row[c.key] ?? null;
                const isFund = c.key === 'fund';
                return (
                  <td key={c.key} className={`px-2.5 py-1.5 ${c.align === 'right' ? 'tnum text-right' : 'text-left'} ${isFund ? 'serif text-[var(--ink)]' : 'text-[var(--ink-dim)]'}`}>
                    {cellText(v, c.key)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Inspector({
  fundId,
  compareMode,
  checkedIds,
  onToggleCheck,
  maxCompare,
}: {
  fundId: string | null;
  compareMode: CompareMode;
  checkedIds: string[];
  onToggleCheck: (id: string) => void;
  maxCompare: number;
}) {
  const [detail, setDetail] = useState<FundDetailResponse | null>(null);
  const [charts, setCharts] = useState<ChartPayload[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fundId) { setDetail(null); setCharts([]); setSuggestions([]); return; }
    let cancelled = false;
    setLoading(true); setError(null); setCharts([]);
    (async () => {
      try {
        const [d, s, ...cs] = await Promise.all([
          getFund(fundId),
          getSuggestions([fundId]),
          ...SINGLE_CHARTS.map((k) => getChart(k, [fundId], compareMode)),
        ]);
        if (cancelled) return;
        setDetail(d);
        setSuggestions(s.suggestions);
        setCharts(cs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load fund');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fundId, compareMode]);

  if (!fundId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="serif text-lg text-[var(--ink-dim)]">Select a fund</p>
        <p className="max-w-xs text-sm text-[var(--ink-faint)]">
          Choose a fund from the ledger to see its facts, performance charts and comparable funds.
        </p>
      </div>
    );
  }

  if (loading && !detail) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--ink-faint)]">Loading…</div>;
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-[var(--neg)]">
        {error}
      </div>
    );
  }
  if (!detail) return null;

  const f = detail.fund;
  const colour = f.providerColour ?? '#5f6f7a';
  const checked = checkedIds.includes(f.id);
  const compareFull = checkedIds.length >= maxCompare;

  return (
    <div className="h-full overflow-auto px-6 py-5">
      {/* header */}
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-10 w-[3px] shrink-0 rounded-full" style={{ background: colour }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="serif text-[22px] font-medium leading-tight text-[var(--ink)]">{f.name}</h2>
          <p className="mt-1 text-sm text-[var(--ink-dim)]">
            {f.provider} · {f.assetClass}{f.category ? ` · ${f.category}` : ''}
          </p>
        </div>
        <button
          onClick={() => onToggleCheck(f.id)}
          disabled={!checked && compareFull}
          className={`shrink-0 rounded-sm border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
            checked
              ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent)]'
              : 'border-[var(--line)] text-[var(--ink-dim)] hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-30'
          }`}
        >
          {checked ? '✓ In comparison' : 'Add to compare'}
        </button>
      </div>

      {/* facts */}
      <dl className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4 border-y border-[var(--line)] py-4">
        <Fact label="Risk rating" value={riskLabel(f.riskRating)} />
        <Fact label="AMC" value={chargePct(f.amcPct)} />
        <Fact label="OCF" value={chargePct(f.ongoingChargePct)} />
        <Fact label="SFDR" value={f.sfdrArticle ? SFDR_LABEL[f.sfdrArticle] ?? '—' : '—'} />
        <Fact label="Launched" value={monthYear(f.launchDate)} />
        <Fact label="History" value={historyLabel(Number((f.metrics as { monthsOfHistory?: number } | null)?.monthsOfHistory ?? 0))} />
        {f.manager ? <Fact label="Manager" value={f.manager} /> : null}
        {f.style ? <Fact label="Style" value={f.style} /> : null}
        {f.region ? <Fact label="Region" value={f.region} /> : null}
      </dl>

      {/* charts */}
      <div className="mt-5 space-y-6">
        {charts.map((c) => (
          <ChartBlock key={c.key} payload={c} />
        ))}
      </div>

      {/* comparables */}
      {suggestions.length > 0 ? (
        <div className="mt-7 border-t border-[var(--line)] pt-4">
          <h3 className="serif text-sm font-medium text-[var(--ink)]">Comparable funds</h3>
          <p className="mb-3 text-[11px] text-[var(--ink-faint)]">Same asset class, similar risk rating.</p>
          <ul className="space-y-1.5">
            {suggestions.map((s) => {
              const sChecked = checkedIds.includes(s.id);
              const sFull = checkedIds.length >= maxCompare;
              return (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: s.providerColour ?? '#5f6f7a' }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink-dim)]">
                    {s.name} <span className="text-[var(--ink-faint)]">· Risk {s.riskRating ?? '—'}</span>
                  </span>
                  <button
                    onClick={() => onToggleCheck(s.id)}
                    disabled={!sChecked && sFull}
                    className={`shrink-0 rounded-sm px-2 py-0.5 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                      sChecked ? 'text-[var(--accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--accent)] disabled:opacity-30'
                    }`}
                  >
                    {sChecked ? '✓' : '+ compare'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-[var(--ink-faint)]">{label}</dt>
      <dd className="tnum mt-0.5 text-sm text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function ChartBlock({ payload }: { payload: ChartPayload }) {
  return (
    <figure>
      <figcaption className="serif mb-1 text-sm font-medium text-[var(--ink)]">{payload.title}</figcaption>
      {payload.kind === 'table' ? <ChartTable payload={payload} /> : <EChart payload={payload} height={220} />}
      <p className="mt-1 text-[10.5px] leading-snug text-[var(--ink-faint)]">{payload.footnote}</p>
    </figure>
  );
}
