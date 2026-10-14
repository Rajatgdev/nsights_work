'use client';

import { useEffect, useState } from 'react';
import { getChart, type ChartPayload, type CompareMode } from '../lib/api';
import { EChart } from './EChart';

interface TableSpec {
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, string | number | null>[];
  highlightRowId?: string;
}

export function CompareOverlay({
  fundIds,
  compareMode,
  onClose,
  onToggleMode,
}: {
  fundIds: string[];
  compareMode: CompareMode;
  onClose: () => void;
  onToggleMode: (m: CompareMode) => void;
}) {
  const [growth, setGrowth] = useState<ChartPayload | null>(null);
  const [summary, setSummary] = useState<ChartPayload | null>(null);
  const [metrics, setMetrics] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [g, s, m] = await Promise.all([
          getChart('growth10k', fundIds, compareMode),
          getChart('comparisonSummary', fundIds, compareMode),
          getChart('keyMetrics', fundIds, compareMode),
        ]);
        if (cancelled) return;
        setGrowth(g); setSummary(s); setMetrics(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load comparison');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fundIds, compareMode]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--ground)]" role="dialog" aria-modal="true" aria-label="Fund comparison">
      <header className="flex items-center gap-4 border-b border-[var(--line)] px-6 py-3">
        <h2 className="serif text-lg font-medium text-[var(--ink)]">Comparison</h2>
        <div className="flex items-center gap-1 text-xs">
          <ModeBtn active={compareMode === 'common'} onClick={() => onToggleMode('common')}>Common window</ModeBtn>
          <ModeBtn active={compareMode === 'own'} onClick={() => onToggleMode('own')}>Own history</ModeBtn>
        </div>
        <button
          onClick={onClose}
          className="ml-auto rounded-sm border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          Close (Esc)
        </button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <p className="text-sm text-[var(--ink-faint)]">Loading comparison…</p>
        ) : error ? (
          <p className="text-sm text-[var(--neg)]">{error}</p>
        ) : (
          <div className="mx-auto max-w-5xl space-y-7">
            {growth ? (
              <section>
                <h3 className="serif mb-1 text-base font-medium text-[var(--ink)]">{growth.title}</h3>
                <EChart payload={growth} height={320} />
                <p className="mt-1.5 text-[11px] text-[var(--ink-faint)]">{growth.footnote}</p>
              </section>
            ) : null}

            {summary ? <TableSection title="Comparison summary" payload={summary} /> : null}
            {metrics ? <TableSection title="Key metrics" payload={metrics} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm px-2.5 py-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
        active ? 'bg-[var(--accent-wash)] text-[var(--accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-dim)]'
      }`}
    >
      {children}
    </button>
  );
}

function TableSection({ title, payload }: { title: string; payload: ChartPayload }) {
  const spec = payload.data as unknown as TableSpec;
  return (
    <section>
      <h3 className="serif mb-2 text-base font-medium text-[var(--ink)]">{title}</h3>
      <div className="overflow-x-auto rounded-sm border border-[var(--line)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--ink-faint)]">
              {spec.columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((row, i) => {
              const highlight = spec.highlightRowId && row.id === spec.highlightRowId;
              return (
                <tr key={String(row.id ?? i)} className={`border-b border-[var(--line-soft)] ${highlight ? 'bg-[var(--accent-wash)]' : ''}`}>
                  {spec.columns.map((c) => {
                    const v = row[c.key] ?? null;
                    const isFund = c.key === 'fund';
                    return (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${c.align === 'right' ? 'tnum text-right' : 'text-left'} ${
                          isFund ? 'serif text-[var(--ink)]' : 'text-[var(--ink-dim)]'
                        }`}
                        style={SIGNED_KEYS.has(c.key) ? { color: cellColour(v) } : undefined}
                      >
                        {formatCell(v, c.key)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--ink-faint)]">{payload.footnote}</p>
    </section>
  );
}

// Percent-valued columns (registry already ×100); sharpe is a ratio; fund is text.
const PCT_KEYS = new Set(['ytd', 'r3', 'r5', 'r7', 'vol5y', 'mdd5y']);
const SIGNED_KEYS = new Set(['ytd', 'r3', 'r5', 'r7', 'mdd5y']); // vol is non-signed

function formatCell(v: string | number | null, key: string): string {
  if (v == null) return '—';
  if (typeof v !== 'number') return v;
  if (PCT_KEYS.has(key)) {
    const sign = SIGNED_KEYS.has(key) && v > 0 ? '+' : '';
    return `${sign}${v}%`;
  }
  return String(v);
}

function cellColour(v: string | number | null): string {
  if (typeof v !== 'number' || v === 0) return 'var(--ink-dim)';
  return v > 0 ? 'var(--pos)' : 'var(--neg)';
}
