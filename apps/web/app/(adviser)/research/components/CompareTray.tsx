'use client';

import type { FundListItem } from '../lib/api';

export function CompareTray({
  funds,
  onRemove,
  onClear,
  onCompare,
}: {
  funds: FundListItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: () => void;
}) {
  if (funds.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-5 pb-5">
      <div className="pointer-events-auto flex max-w-5xl flex-wrap items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        <span className="pr-1 text-xs text-[var(--ink-faint)]">Compare</span>
        {funds.map((f) => (
          <span
            key={f.id}
            className="flex items-center gap-1.5 rounded-sm bg-[var(--surface)] py-1 pl-1.5 pr-1 text-xs text-[var(--ink)]"
          >
            <span className="h-3.5 w-[3px] rounded-full" style={{ background: f.providerColour ?? '#5f6f7a' }} aria-hidden />
            <span className="max-w-[180px] truncate">{f.name}</span>
            <button
              onClick={() => onRemove(f.id)}
              aria-label={`Remove ${f.name}`}
              className="ml-0.5 rounded px-1 text-[var(--ink-faint)] hover:text-[var(--neg)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={onClear}
          className="ml-1 rounded-sm px-2 py-1 text-xs text-[var(--ink-faint)] hover:text-[var(--ink-dim)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          Clear
        </button>
        <button
          onClick={onCompare}
          disabled={funds.length < 2}
          className="ml-1 rounded-sm bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[#07140f] transition-colors hover:bg-[var(--accent-deep)] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)]"
        >
          Compare {funds.length} →
        </button>
      </div>
    </div>
  );
}
