'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listFunds, type FundFilters, type FundListItem, type CompareMode,
} from './lib/api';
import { monthYear } from './lib/format';
import { FilterBar } from './components/FilterBar';
import { FundLedger } from './components/FundLedger';
import { Inspector } from './components/Inspector';
import { CompareTray } from './components/CompareTray';
import { CompareOverlay } from './components/CompareOverlay';

const MAX_COMPARE = 4;

export default function ResearchPage() {
  const [filters, setFilters] = useState<FundFilters>({});
  const [funds, setFunds] = useState<FundListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [dataMonth, setDataMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState<CompareMode>('common');
  const [compareOpen, setCompareOpen] = useState(false);

  // debounce the search box
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedFilters, setDebouncedFilters] = useState<FundFilters>({});
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedFilters(filters), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filters]);

  // load list on (debounced) filter change
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(null);
    listFunds(debouncedFilters)
      .then((r) => {
        if (cancelled) return;
        setFunds(r.funds);
        setDataMonth(r.dataMonth);
        // "total" = full universe; fetch once with no filters to know it
        if (Object.keys(debouncedFilters).length === 0) setTotal(r.count);
      })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedFilters]);

  const toggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id],
    );
  }, []);

  const checkedFunds = useMemo(
    () => checkedIds.map((id) => funds.find((f) => f.id === id)).filter(Boolean) as FundListItem[],
    [checkedIds, funds],
  );

  return (
    <div data-surface="research" className="-m-8 flex h-[calc(100vh)] flex-col">
      {/* header */}
      <header className="flex items-center gap-4 border-b border-[var(--line)] px-5 py-3">
        <h1 className="serif text-xl font-medium text-[var(--ink)]">Research</h1>
        <p className="text-xs text-[var(--ink-dim)]">
          {dataMonth ? `Data as at ${monthYear(dataMonth)}` : ''}
        </p>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="pr-1 text-[var(--ink-faint)]">Compare on</span>
          <ModeBtn active={compareMode === 'common'} onClick={() => setCompareMode('common')}>Common window</ModeBtn>
          <ModeBtn active={compareMode === 'own'} onClick={() => setCompareMode('own')}>Own history</ModeBtn>
        </div>
      </header>

      <FilterBar filters={filters} onChange={setFilters} shown={funds.length} total={total || funds.length} />

      {loadError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--neg)]">{loadError}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="min-h-0 border-r border-[var(--line)]">
            <FundLedger
              funds={funds}
              loading={loading}
              selectedId={selectedId}
              checkedIds={checkedIds}
              onSelect={setSelectedId}
              onToggleCheck={toggleCheck}
              onClearFilters={() => setFilters({})}
              maxCompare={MAX_COMPARE}
            />
          </div>
          <div className="hidden min-h-0 lg:block">
            <Inspector
              fundId={selectedId}
              compareMode={compareMode}
              checkedIds={checkedIds}
              onToggleCheck={toggleCheck}
              maxCompare={MAX_COMPARE}
            />
          </div>
        </div>
      )}

      {/* on small screens the inspector stacks below via a separate region */}
      <div className="lg:hidden" />

      <CompareTray
        funds={checkedFunds}
        onRemove={toggleCheck}
        onClear={() => setCheckedIds([])}
        onCompare={() => setCompareOpen(true)}
      />

      {compareOpen && checkedIds.length >= 2 ? (
        <CompareOverlay
          fundIds={checkedIds}
          compareMode={compareMode}
          onClose={() => setCompareOpen(false)}
          onToggleMode={setCompareMode}
        />
      ) : null}
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
