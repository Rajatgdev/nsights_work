'use client';

import type { FundListItem } from '../lib/api';
import { pct, pctPlain, signClass } from '../lib/format';

const PROVIDER_FALLBACK = '#5f6f7a';

export function FundLedger({
  funds,
  loading,
  selectedId,
  checkedIds,
  onSelect,
  onToggleCheck,
  onClearFilters,
  maxCompare,
}: {
  funds: FundListItem[];
  loading: boolean;
  selectedId: string | null;
  checkedIds: string[];
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onClearFilters: () => void;
  maxCompare: number;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--ink-faint)]">
        Loading funds…
      </div>
    );
  }

  if (funds.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-[var(--ink-dim)]">No funds match these filters.</p>
        <button
          onClick={onClearFilters}
          className="rounded-sm border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent-wash)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          Clear filters
        </button>
      </div>
    );
  }

  const compareFull = checkedIds.length >= maxCompare;

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--ground)]">
          <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-wide text-[var(--ink-faint)]">
            <th className="w-8" />
            <th className="py-2 pl-2 pr-3 text-left font-medium">Fund</th>
            <th className="px-2 text-right font-medium">Risk</th>
            <th className="px-2 text-right font-medium">YTD</th>
            <th className="px-2 text-right font-medium">1y</th>
            <th className="px-2 text-right font-medium">5y p.a.</th>
            <th className="px-2 text-right font-medium">Vol 5y</th>
            <th className="w-10 pr-3 text-right font-medium">Cmp</th>
          </tr>
        </thead>
        <tbody>
          {funds.map((f) => {
            const checked = checkedIds.includes(f.id);
            const selected = selectedId === f.id;
            const colour = f.providerColour ?? PROVIDER_FALLBACK;
            return (
              <tr
                key={f.id}
                className={`group cursor-pointer border-b border-[var(--line-soft)] transition-colors ${
                  selected ? 'bg-[var(--accent-wash)]' : 'hover:bg-[var(--surface)]'
                }`}
                onClick={() => onSelect(f.id)}
              >
                <td className="relative">
                  <span
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: colour }}
                    aria-hidden
                  />
                </td>
                <td className="py-2 pl-2 pr-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelect(f.id); }}
                    className="block text-left focus:outline-none"
                  >
                    <span className="serif text-[15px] font-medium leading-tight text-[var(--ink)]">
                      {f.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">
                      {f.provider} · {f.assetClass}
                    </span>
                  </button>
                </td>
                <td className="tnum px-2 text-right text-[var(--ink-dim)]">{f.riskRating ?? '—'}</td>
                <Metric value={f.ytd} />
                <Metric value={f.r1} />
                <Metric value={f.r5} />
                <td className="tnum px-2 text-right text-[var(--ink-dim)]">{pctPlain(f.vol5y)}</td>
                <td className="pr-3 text-right">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && compareFull}
                    onChange={() => onToggleCheck(f.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Add ${f.name} to comparison`}
                    className="h-4 w-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-30"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ value }: { value: number | null }) {
  const cls = signClass(value);
  const colour = cls === 'pos' ? 'var(--pos)' : cls === 'neg' ? 'var(--neg)' : 'var(--ink-dim)';
  return (
    <td className="tnum px-2 text-right" style={{ color: colour }}>
      {pct(value)}
    </td>
  );
}
