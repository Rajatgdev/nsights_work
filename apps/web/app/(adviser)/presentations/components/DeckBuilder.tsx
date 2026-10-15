'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getPresentation, updatePresentation, addSlide, updateSlide, deleteSlide, reorderSlides,
  generateCommentary, listFundsForPicker,
  type PresentationDetail, type Slide, type SlideKind, type TemplateId, type CompareMode, type FundPick,
  CHART_SLIDE_KEYS,
} from '../lib/api';
import { SlidePreview } from './SlidePreview';

const TEMPLATES: { id: TemplateId; name: string }[] = [
  { id: 'boardroom', name: 'Boardroom' }, { id: 'editorial', name: 'Editorial' }, { id: 'monoline', name: 'Monoline' },
];
const SLIDE_KINDS: { kind: SlideKind; label: string }[] = [
  { kind: 'chart', label: 'Chart' }, { kind: 'summary', label: 'Comparison summary' },
  { kind: 'portfolio', label: 'Portfolio' }, { kind: 'team', label: 'Team' },
  { kind: 'philosophy', label: 'Philosophy' }, { kind: 'strategy', label: 'Strategy' },
];
const CHART_LABELS: Record<string, string> = {
  growth10k: 'Growth of €10k', cumulative5y: 'Cumulative 5y', annualised: 'Annualised returns',
  calendarYear: 'Calendar-year', discreteAnnual: 'Discrete annual', rolling2y: 'Rolling 2y',
  historicVol: 'Historic volatility', stressDrawdown: 'Stress drawdown', histMonthly: 'Monthly distribution',
  histQuarterly: 'Quarterly distribution', riskReturn: 'Risk vs return', charges: 'Charges',
  keyMetrics: 'Key metrics', comparisonSummary: 'Comparison summary',
};
const FALLBACK = '#5f6f7a';

export function DeckBuilder({ id }: { id: string }) {
  const router = useRouter();
  const [p, setP] = useState<PresentationDetail | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dataMonth, setDataMonth] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getPresentation(id);
      setP(d.presentation);
      setSlides(d.slides);
      setSelected((cur) => cur ?? d.slides[0]?.id ?? null);
      // data month from any chart response, else blank; cheap: fetch funds dataMonth
      const fm = await fetch('/api/funds').then((r) => r.json()).catch(() => null);
      if (fm?.dataMonth) setDataMonth(fm.dataMonth);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const sel = slides.find((s) => s.id === selected) ?? null;

  async function patchMeta(body: Partial<PresentationDetail>) {
    if (!p) return;
    setP({ ...p, ...body });
    await updatePresentation(id, body as never).catch(() => undefined);
  }

  async function addNewSlide(kind: SlideKind) {
    const r = await addSlide(id, { kind, ...(kind === 'chart' ? { chartKey: 'growth10k' } : {}) });
    await load();
    setSelected(r.id);
  }
  async function removeSlide(sid: string) {
    await deleteSlide(sid);
    setSelected((cur) => (cur === sid ? null : cur));
    await load();
  }
  async function patchSlide(sid: string, body: Partial<Slide>) {
    setSlides((prev) => prev.map((s) => (s.id === sid ? { ...s, ...body } : s)));
    await updateSlide(sid, body as never).catch(() => undefined);
  }
  async function move(sid: string, dir: -1 | 1) {
    const idx = slides.findIndex((s) => s.id === sid);
    const to = idx + dir;
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    const [m] = next.splice(idx, 1);
    next.splice(to, 0, m!);
    setSlides(next);
    await reorderSlides(id, next.map((s) => s.id)).catch(() => undefined);
  }

  if (error) return <div data-surface="portfolio" className="-m-8 flex min-h-[calc(100vh)] items-center justify-center text-sm text-[var(--neg)]">{error}</div>;
  if (!p) return <div data-surface="portfolio" className="-m-8 flex min-h-[calc(100vh)] items-center justify-center text-sm text-[var(--ink-faint)]">Loading…</div>;

  return (
    <div data-surface="portfolio" className="-m-8 flex h-[calc(100vh)] flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--line)] px-6 py-3">
        <button onClick={() => router.push('/presentations')} className="text-sm text-[var(--ink-faint)] hover:text-[var(--ink-dim)]">← Presentations</button>
        <input value={p.title} onChange={(e) => patchMeta({ title: e.target.value })}
          className="serif min-w-0 flex-1 bg-transparent text-lg font-medium text-[var(--ink)] focus:outline-none" />
        <div className="flex items-center gap-1 text-xs">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => patchMeta({ templateId: t.id })}
              className={`rounded-sm px-2.5 py-1 ${p.templateId === t.id ? 'bg-[var(--accent-wash)] text-[var(--accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-dim)]'}`}>{t.name}</button>
          ))}
        </div>
        <div className="ml-2 flex items-center gap-1 text-xs">
          <span className="pr-1 text-[var(--ink-faint)]">Window</span>
          {(['common', 'own'] as CompareMode[]).map((cm) => (
            <button key={cm} onClick={() => patchMeta({ compareMode: cm })}
              className={`rounded-sm px-2 py-1 ${p.compareMode === cm ? 'bg-[var(--accent-wash)] text-[var(--accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-dim)]'}`}>{cm === 'common' ? 'Common' : 'Own'}</button>
          ))}
        </div>
        <button disabled title="Export comes in the next step"
          className="ml-2 rounded-sm bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[#07140f] opacity-40">Export</button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)_320px]">
        {/* RAIL */}
        <div className="min-h-0 overflow-auto border-r border-[var(--line)] p-3">
          <ol className="space-y-1.5">
            {slides.map((s, i) => (
              <li key={s.id}>
                <button onClick={() => setSelected(s.id)}
                  className={`w-full rounded-sm border px-2 py-2 text-left text-xs ${selected === s.id ? 'border-[var(--accent)] bg-[var(--accent-wash)]' : 'border-[var(--line)] hover:border-[var(--ink-faint)]'}`}>
                  <span className="text-[10px] text-[var(--ink-faint)]">{i + 1}</span>
                  <span className="ml-1.5 capitalize text-[var(--ink)]">{s.kind}{s.chartKey ? `: ${CHART_LABELS[s.chartKey] ?? s.chartKey}` : ''}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--ink-faint)]">Add slide</p>
            <div className="flex flex-wrap gap-1">
              {SLIDE_KINDS.map((k) => (
                <button key={k.kind} onClick={() => addNewSlide(k.kind)}
                  className="rounded-sm border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)] hover:border-[var(--accent)] hover:text-[var(--ink)]">+ {k.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="min-h-0 overflow-auto px-6 py-6">
          <SlidePreview slide={sel} template={p.templateId} compareMode={p.compareMode}
            firmName="Your Firm" clientName={p.clientName} adviserName={p.adviserName} dataMonth={dataMonth || '—'} />
          {sel ? (
            <div className="mx-auto mt-2 flex w-full max-w-[720px] items-center justify-between text-xs text-[var(--ink-faint)]">
              <div className="flex gap-1">
                <button onClick={() => move(sel.id, -1)} className="rounded-sm px-2 py-1 hover:text-[var(--ink-dim)]">↑ Up</button>
                <button onClick={() => move(sel.id, 1)} className="rounded-sm px-2 py-1 hover:text-[var(--ink-dim)]">↓ Down</button>
              </div>
              <button onClick={() => removeSlide(sel.id)} className="rounded-sm px-2 py-1 hover:text-[var(--neg)]">Delete slide</button>
            </div>
          ) : null}
        </div>

        {/* EDITOR */}
        <div className="min-h-0 overflow-auto border-l border-[var(--line)] px-4 py-5">
          {!sel ? <p className="text-sm text-[var(--ink-faint)]">Select a slide to edit.</p> : (
            <SlideEditor
              key={sel.id}
              slide={sel}
              onPatch={(b) => patchSlide(sel.id, b)}
              onGenerate={async () => { const r = await generateCommentary(sel.id); await patchSlide(sel.id, { commentaryText: r.text }); }}
            />
          )}
        </div>
      </div>

      {/* meta editor row */}
      <div className="flex items-center gap-4 border-t border-[var(--line)] px-6 py-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-[var(--ink-faint)]">Client</span>
          <input value={p.clientName ?? ''} onChange={(e) => patchMeta({ clientName: e.target.value || null })}
            placeholder="(optional)" className="h-7 w-40 rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[var(--ink-faint)]">Adviser</span>
          <input value={p.adviserName ?? ''} onChange={(e) => patchMeta({ adviserName: e.target.value || null })}
            className="h-7 w-40 rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none" />
        </label>
        <span className="ml-auto text-[var(--ink-faint)]">{slides.length} slides · data as at {dataMonth || '—'}</span>
      </div>
    </div>
  );
}

function SlideEditor({ slide, onPatch, onGenerate }: { slide: Slide; onPatch: (b: Partial<Slide>) => void; onGenerate: () => Promise<void> }) {
  const [rows, setRows] = useState<FundPick[]>([]);
  const [q, setQ] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [picker, setPicker] = useState(false);
  const [gen, setGen] = useState(false);

  useEffect(() => {
    if (!picker) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { listFundsForPicker(q || undefined).then((r) => setRows(r.funds)).catch(() => setRows([])); }, 200);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [picker, q]);

  // resolve selected fund names for display
  const [names, setNames] = useState<Record<string, FundPick>>({});
  useEffect(() => {
    if (slide.fundIds.length === 0) return;
    listFundsForPicker().then((r) => { const m: Record<string, FundPick> = {}; r.funds.forEach((f) => (m[f.id] = f)); setNames(m); }).catch(() => undefined);
  }, [slide.fundIds.length]);

  if (slide.kind !== 'chart') {
    return (
      <div>
        <h3 className="serif text-sm font-medium text-[var(--ink)] capitalize">{slide.kind} slide</h3>
        <p className="mt-2 text-sm text-[var(--ink-faint)]">
          {slide.kind === 'cover' || slide.kind === 'disclaimer'
            ? 'Rendered from the deck title, client, adviser and data month.'
            : 'This slide is laid out by the chosen template at export.'}
        </p>
      </div>
    );
  }

  const addFund = (f: FundPick) => { if (!slide.fundIds.includes(f.id)) onPatch({ fundIds: [...slide.fundIds, f.id] }); };
  const removeFund = (fid: string) => onPatch({ fundIds: slide.fundIds.filter((x) => x !== fid) });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="serif text-sm font-medium text-[var(--ink)]">Chart type</h3>
        <select value={slide.chartKey ?? ''} onChange={(e) => onPatch({ chartKey: e.target.value })}
          className="mt-1.5 h-8 w-full rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none">
          {CHART_SLIDE_KEYS.map((k) => <option key={k} value={k}>{CHART_LABELS[k] ?? k}</option>)}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="serif text-sm font-medium text-[var(--ink)]">Funds</h3>
          <button onClick={() => setPicker((v) => !v)} className="text-xs text-[var(--accent)]">{picker ? 'Done' : '+ Add'}</button>
        </div>
        {slide.fundIds.length === 0 ? <p className="mt-1 text-xs text-[var(--ink-faint)]">No funds yet.</p> : (
          <ul className="mt-1.5 space-y-1">
            {slide.fundIds.map((fid) => (
              <li key={fid} className="flex items-center gap-2 text-sm">
                <span className="h-4 w-[3px] rounded-full" style={{ background: names[fid]?.providerColour ?? FALLBACK }} />
                <span className="min-w-0 flex-1 truncate text-[var(--ink-dim)]">{names[fid]?.name ?? fid}</span>
                <button onClick={() => removeFund(fid)} className="text-[var(--ink-faint)] hover:text-[var(--neg)]">×</button>
              </li>
            ))}
          </ul>
        )}
        {picker ? (
          <div className="mt-2 rounded-sm border border-[var(--line)] bg-[var(--surface)] p-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search funds…"
              className="h-7 w-full rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none" />
            <ul className="mt-1.5 max-h-48 overflow-auto">
              {rows.map((f) => (
                <li key={f.id} className="flex items-center gap-2 border-b border-[var(--line-soft)] py-1 text-xs">
                  <span className="h-4 w-[3px] rounded-full" style={{ background: f.providerColour ?? FALLBACK }} />
                  <span className="min-w-0 flex-1 truncate text-[var(--ink-dim)]">{f.name}</span>
                  <button onClick={() => addFund(f)} disabled={slide.fundIds.includes(f.id)} className="text-[var(--accent)] disabled:text-[var(--ink-faint)]">{slide.fundIds.includes(f.id) ? '✓' : '+'}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="serif text-sm font-medium text-[var(--ink)]">Commentary</h3>
          <label className="flex items-center gap-1 text-xs text-[var(--ink-faint)]">
            <input type="checkbox" checked={slide.commentaryEnabled} onChange={(e) => onPatch({ commentaryEnabled: e.target.checked })} className="accent-[var(--accent)]" /> on
          </label>
        </div>
        {slide.commentaryEnabled ? (
          <>
            <textarea value={slide.commentaryText ?? ''} onChange={(e) => onPatch({ commentaryText: e.target.value })}
              placeholder="Generate or write commentary…" rows={4}
              className="mt-1.5 w-full rounded-sm border border-[var(--line)] bg-[var(--surface-2)] p-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none" />
            <button
              onClick={async () => { setGen(true); await onGenerate(); setGen(false); }}
              disabled={gen || !slide.chartKey || slide.fundIds.length === 0}
              className="mt-1.5 rounded-sm border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent-wash)] disabled:opacity-40">
              {gen ? 'Generating…' : 'Generate commentary'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
