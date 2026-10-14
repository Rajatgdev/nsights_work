'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  analyseAdhoc, suggestFunds, createPortfolio, updatePortfolio, listFundsForPicker,
  type Approach, type Kind, type Rebalancing, type AnalyseResponse, type SuggestResponse,
  type FundPick, type HoldingInput,
} from '../lib/api';
import { BlendChart } from './BlendChart';
import { BlendBars } from './BlendBars';

const APPROACHES: { key: Approach; label: string; blurb: string }[] = [
  { key: 'core-satellite', label: 'Core / Satellite', blurb: 'A multi-asset core with focused satellites around it.' },
  { key: 'equal-weighted', label: 'Equal-weighted', blurb: 'Several funds held at roughly equal weight.' },
  { key: 'multi-manager', label: 'Multi-manager', blurb: 'Diversify across distinct fund managers.' },
  { key: 'multi-strategy', label: 'Multi-strategy', blurb: 'Blend different strategies — growth, income, ESG, passive.' },
];

const PROVIDERS = ['Zurich', 'Irish Life', 'Aviva', 'New Ireland', 'Standard Life', 'Royal London'];
const FALLBACK = '#5f6f7a';

interface Row { fund: FundPick; weightBp: number }

export function Builder({ initial }: { initial?: { id: string; name: string; kind: Kind; approach: Approach | null; rebalancing: Rebalancing; rows: Row[] } }) {
  const router = useRouter();

  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'personal');
  const [approach, setApproach] = useState<Approach>(initial?.approach ?? 'core-satellite');
  const [rebalancing, setRebalancing] = useState<Rebalancing>(initial?.rebalancing ?? 'monthly');
  const [rows, setRows] = useState<Row[]>(initial?.rows ?? []);

  const [analysis, setAnalysis] = useState<AnalyseResponse | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [suggest, setSuggest] = useState<SuggestResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalBp = rows.reduce((a, r) => a + r.weightBp, 0);
  const balanced = rows.length > 0 && totalBp === 10000;

  // ── fund picker ──
  const [pickOpen, setPickOpen] = useState(false);
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('');
  const [picks, setPicks] = useState<FundPick[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!pickOpen) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      listFundsForPicker(q || undefined, provider || undefined).then((r) => setPicks(r.funds)).catch(() => setPicks([]));
    }, 200);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [pickOpen, q, provider]);

  const addFund = useCallback((f: FundPick) => {
    setRows((prev) => (prev.some((r) => r.fund.id === f.id) ? prev : [...prev, { fund: f, weightBp: 0 }]));
  }, []);
  const removeFund = (id: string) => setRows((prev) => prev.filter((r) => r.fund.id !== id));
  const setWeight = (id: string, pct: number) =>
    setRows((prev) => prev.map((r) => (r.fund.id === id ? { ...r, weightBp: Math.round(pct * 100) } : r)));
  const equalise = () => {
    if (rows.length === 0) return;
    const each = Math.floor(10000 / rows.length);
    const rem = 10000 - each * rows.length;
    setRows((prev) => prev.map((r, i) => ({ ...r, weightBp: each + (i === 0 ? rem : 0) })));
  };

  const holdingInputs = (): HoldingInput[] => rows.map((r) => ({ fundId: r.fund.id, weightBp: r.weightBp }));

  // ── live analyse when balanced ──
  useEffect(() => {
    if (!balanced) { setAnalysis(null); return; }
    let cancelled = false;
    setAnalysing(true);
    analyseAdhoc(holdingInputs(), rebalancing)
      .then((a) => { if (!cancelled) setAnalysis(a); })
      .catch(() => { if (!cancelled) setAnalysis(null); })
      .finally(() => { if (!cancelled) setAnalysing(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rows.map((r) => [r.fund.id, r.weightBp])), rebalancing, balanced]);

  // ── suggestions on approach / holdings change ──
  useEffect(() => {
    let cancelled = false;
    suggestFunds(approach, holdingInputs())
      .then((s) => { if (!cancelled) setSuggest(s); })
      .catch(() => { if (!cancelled) setSuggest(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approach, JSON.stringify(rows.map((r) => r.fund.id))]);

  async function save() {
    setSaveError(null);
    if (!name.trim()) { setSaveError('Give the portfolio a name.'); return; }
    if (!balanced) { setSaveError('Weights must total 100%.'); return; }
    setSaving(true);
    try {
      if (initial) {
        await updatePortfolio(initial.id, { name, approach, rebalancing, holdings: holdingInputs() });
        router.push('/portfolios');
      } else {
        await createPortfolio({ kind, name, approach, rebalancing, holdings: holdingInputs() });
        router.push('/portfolios');
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save');
      setSaving(false);
    }
  }

  const colour = (f: FundPick) => f.providerColour ?? FALLBACK;

  return (
    <div data-surface="portfolio" className="-m-8 flex min-h-[calc(100vh)] flex-col">
      {/* header */}
      <header className="flex items-center gap-4 border-b border-[var(--line)] px-6 py-3">
        <button onClick={() => router.push('/portfolios')} className="text-sm text-[var(--ink-faint)] hover:text-[var(--ink-dim)]">← Portfolios</button>
        <h1 className="serif text-xl font-medium text-[var(--ink)]">{initial ? 'Edit portfolio' : 'New portfolio'}</h1>
        <div className="ml-auto flex items-center gap-2">
          {saveError ? <span className="text-xs text-[var(--neg)]">{saveError}</span> : null}
          <button
            onClick={save}
            disabled={saving || !balanced || !name.trim()}
            className="rounded-sm bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[#07140f] hover:bg-[var(--accent-deep)] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {saving ? 'Saving…' : 'Save portfolio'}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* LEFT: setup + holdings + weights */}
        <div className="min-h-0 overflow-auto border-r border-[var(--line)] px-6 py-5">
          {/* name + kind */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] text-[var(--ink-faint)]">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Balanced Growth 60/40"
                className="h-9 w-full rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none" />
            </label>
            {!initial ? (
              <div className="flex items-center gap-1 text-xs">
                <Seg active={kind === 'personal'} onClick={() => setKind('personal')}>Personal</Seg>
                <Seg active={kind === 'house'} onClick={() => setKind('house')}>House</Seg>
              </div>
            ) : null}
            <div className="flex items-center gap-1 text-xs">
              <span className="pr-1 text-[var(--ink-faint)]">Rebalance</span>
              <Seg active={rebalancing === 'monthly'} onClick={() => setRebalancing('monthly')}>Monthly</Seg>
              <Seg active={rebalancing === 'buy-and-hold'} onClick={() => setRebalancing('buy-and-hold')}>Buy &amp; hold</Seg>
            </div>
          </div>

          {/* approach */}
          <h2 className="serif mt-6 text-sm font-medium text-[var(--ink)]">Approach</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {APPROACHES.map((a) => (
              <button key={a.key} onClick={() => setApproach(a.key)}
                className={`rounded-sm border px-3 py-2 text-left transition-colors ${approach === a.key ? 'border-[var(--accent)] bg-[var(--accent-wash)]' : 'border-[var(--line)] hover:border-[var(--ink-faint)]'}`}>
                <span className={`block text-sm ${approach === a.key ? 'text-[var(--accent)]' : 'text-[var(--ink)]'}`}>{a.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-faint)]">{a.blurb}</span>
              </button>
            ))}
          </div>
          {suggest?.fit ? (
            <p className={`mt-2 text-[11px] ${suggest.fit.ok ? 'text-[var(--pos)]' : 'text-[var(--ink-dim)]'}`}>
              {suggest.fit.ok ? '✓ ' : '• '}{suggest.fit.message}
            </p>
          ) : null}

          {/* holdings + weights */}
          <div className="mt-6 flex items-center justify-between">
            <h2 className="serif text-sm font-medium text-[var(--ink)]">Holdings</h2>
            <div className="flex items-center gap-2 text-xs">
              {rows.length > 0 ? <button onClick={equalise} className="rounded-sm px-2 py-1 text-[var(--accent)] hover:bg-[var(--accent-wash)]">Equalise</button> : null}
              <button onClick={() => setPickOpen((v) => !v)} className="rounded-sm border border-[var(--line)] px-2 py-1 text-[var(--ink-dim)] hover:border-[var(--accent)] hover:text-[var(--ink)]">+ Add fund</button>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ink-faint)]">No funds yet. Add funds to build the portfolio.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-[10.5px] uppercase tracking-wide text-[var(--ink-faint)]">
                  <th className="w-8" /><th className="py-1.5 pl-2 text-left font-medium">Fund</th>
                  <th className="px-2 text-right font-medium">Risk</th><th className="px-2 text-right font-medium">Weight %</th><th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fund.id} className="border-b border-[var(--line-soft)]">
                    <td className="relative"><span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: colour(r.fund) }} /></td>
                    <td className="py-1.5 pl-2">
                      <span className="serif text-[14px] text-[var(--ink)]">{r.fund.name}</span>
                      <span className="mt-0.5 block text-[10.5px] text-[var(--ink-faint)]">{r.fund.provider} · {r.fund.assetClass}</span>
                    </td>
                    <td className="tnum px-2 text-right text-[var(--ink-dim)]">{r.fund.riskRating ?? '—'}</td>
                    <td className="px-2 text-right">
                      <input type="number" min={0} max={100} step={1} value={r.weightBp ? r.weightBp / 100 : ''}
                        onChange={(e) => setWeight(r.fund.id, Number(e.target.value))}
                        className="tnum h-7 w-16 rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-2 text-right text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none" />
                    </td>
                    <td className="text-right"><button onClick={() => removeFund(r.fund.id)} aria-label="Remove" className="px-1 text-[var(--ink-faint)] hover:text-[var(--neg)]">×</button></td>
                  </tr>
                ))}
                <tr>
                  <td /><td className="py-2 pl-2 text-[11px] text-[var(--ink-faint)]">Total</td><td />
                  <td className={`tnum px-2 text-right text-sm ${balanced ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}`}>{(totalBp / 100).toFixed(0)}%</td><td />
                </tr>
              </tbody>
            </table>
          )}
          {rows.length > 0 && !balanced ? <p className="mt-1.5 text-[11px] text-[var(--neg)]">Weights must total 100% to analyse and save.</p> : null}

          {/* fund picker */}
          {pickOpen ? (
            <div className="mt-4 rounded-sm border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="flex items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search funds…"
                  className="h-8 flex-1 rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none" />
                <select value={provider} onChange={(e) => setProvider(e.target.value)}
                  className="h-8 rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none">
                  <option value="">All providers</option>
                  {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={() => setPickOpen(false)} className="text-xs text-[var(--ink-faint)] hover:text-[var(--ink-dim)]">Done</button>
              </div>
              <ul className="mt-2 max-h-56 overflow-auto">
                {picks.map((f) => {
                  const added = rows.some((r) => r.fund.id === f.id);
                  return (
                    <li key={f.id} className="flex items-center gap-2 border-b border-[var(--line-soft)] py-1.5">
                      <span className="h-5 w-[3px] rounded-full" style={{ background: f.providerColour ?? FALLBACK }} />
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink-dim)]">{f.name} <span className="text-[var(--ink-faint)]">· {f.provider} · Risk {f.riskRating ?? '—'}</span></span>
                      <button onClick={() => addFund(f)} disabled={added} className="shrink-0 rounded-sm px-2 py-0.5 text-xs text-[var(--accent)] disabled:text-[var(--ink-faint)]">{added ? '✓ added' : '+ add'}</button>
                    </li>
                  );
                })}
                {picks.length === 0 ? <li className="py-2 text-xs text-[var(--ink-faint)]">No funds match.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>

        {/* RIGHT: analysis */}
        <div className="min-h-0 overflow-auto px-6 py-5">
          <h2 className="serif text-sm font-medium text-[var(--ink)]">Analysis</h2>
          {!balanced ? (
            <p className="mt-3 text-sm text-[var(--ink-faint)]">Balance the weights to 100% to see blended performance and the indicative risk class.</p>
          ) : analysing && !analysis ? (
            <p className="mt-3 text-sm text-[var(--ink-faint)]">Analysing…</p>
          ) : analysis ? (
            <div className="mt-3 space-y-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--line)] py-3">
                <Stat label="Structure" value={analysis.structure} />
                <Stat label="Risk profile" value={analysis.riskLabel} />
                <Stat label="Indicative risk class" value={analysis.indicativeRiskClass != null ? `${analysis.indicativeRiskClass} / 7` : '—'} />
                <Stat label="Avg fund rating" value={`${analysis.averageFundRisk} / 7`} />
              </div>
              <p className="text-[10.5px] leading-snug text-[var(--ink-faint)]">
                Indicative risk class is derived from the blended historical volatility — it is not a PRIIPs SRI. The average fund rating is a separate, weighted figure.
              </p>

              <div>
                <h3 className="serif mb-1 text-sm font-medium text-[var(--ink)]">Blended growth of €10,000</h3>
                <BlendChart dates={analysis.dates} series={analysis.blendSeries} />
                {analysis.historyLimitedBy ? (
                  <p className="mt-1 text-[10.5px] text-[var(--ink-faint)]">History starts {analysis.historyLimitedBy.startDate ?? '—'}, limited by {analysis.historyLimitedBy.name}. Data as at {analysis.dataMonth}.</p>
                ) : null}
              </div>

              {(() => {
                const m = analysis.metrics as {
                  ytd?: number | null; r3?: number | null; r5?: number | null; r7?: number | null; r10?: number | null;
                  calendarYears?: { year: number; value: number | null }[];
                };
                const annCats = ['YTD', '3y p.a.', '5y p.a.', '7y p.a.', '10y p.a.'];
                const annVals = [m.ytd ?? null, m.r3 ?? null, m.r5 ?? null, m.r7 ?? null, m.r10 ?? null];
                const cy = (m.calendarYears ?? []).slice(-9);
                return (
                  <>
                    <div>
                      <h3 className="serif mb-1 text-sm font-medium text-[var(--ink)]">Blended annualised returns</h3>
                      <BlendBars categories={annCats} values={annVals} />
                    </div>
                    {cy.length > 0 ? (
                      <div>
                        <h3 className="serif mb-1 text-sm font-medium text-[var(--ink)]">Blended calendar-year returns</h3>
                        <BlendBars categories={cy.map((y) => String(y.year))} values={cy.map((y) => y.value)} />
                      </div>
                    ) : null}
                    <p className="text-[10.5px] leading-snug text-[var(--ink-faint)]">
                      Figures from the blended monthly series, {rebalancing === 'monthly' ? 'monthly rebalanced' : 'buy-and-hold'}. Past performance is not a reliable indicator of future results.
                    </p>
                  </>
                );
              })()}

              {analysis.warnings.length > 0 ? (
                <div className="rounded-sm border border-[var(--line)] p-3">
                  <h3 className="serif mb-1.5 text-sm font-medium text-[var(--ink)]">Things to check</h3>
                  <ul className="space-y-1">
                    {analysis.warnings.map((w) => <li key={w.code} className="text-[12px] text-[var(--neg)]">• {w.message}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* suggestions */}
          {suggest && suggest.suggestions.length > 0 ? (
            <div className="mt-7 border-t border-[var(--line)] pt-4">
              <h3 className="serif text-sm font-medium text-[var(--ink)]">Suggested funds</h3>
              <p className="mb-2 text-[11px] text-[var(--ink-faint)]">Rule-based for this approach — not advice.</p>
              <ul className="space-y-1.5">
                {suggest.suggestions.map((s) => (
                  <li key={s.fundId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink-dim)]">{s.name} <span className="text-[var(--ink-faint)]">· {s.reason}</span></span>
                    <button onClick={() => addFund({ id: s.fundId, name: s.name, provider: s.provider, providerColour: null, assetClass: s.assetClass, riskRating: s.riskRating })}
                      disabled={rows.some((r) => r.fund.id === s.fundId)}
                      className="shrink-0 rounded-sm px-2 py-0.5 text-xs text-[var(--accent)] disabled:text-[var(--ink-faint)]">
                      {rows.some((r) => r.fund.id === s.fundId) ? '✓' : '+ add'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-sm px-2.5 py-1 focus:outline-none ${active ? 'bg-[var(--accent-wash)] text-[var(--accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-dim)]'}`}>{children}</button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--ink-faint)]">{label}</div>
      <div className="tnum mt-0.5 text-sm text-[var(--ink)]">{value}</div>
    </div>
  );
}
