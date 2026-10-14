'use client';

import type { FundFilters } from '../lib/api';

const PROVIDERS = ['Zurich', 'Irish Life', 'Aviva', 'New Ireland', 'Standard Life', 'Royal London'];
const ASSET_CLASSES = ['Equity', 'Multi-Asset', 'Bond', 'Property', 'Cash'];
const RISKS = [1, 2, 3, 4, 5, 6, 7];

export function FilterBar({
  filters,
  onChange,
  shown,
  total,
}: {
  filters: FundFilters;
  onChange: (next: FundFilters) => void;
  shown: number;
  total: number;
}) {
  const active = filters.provider || filters.cls || filters.risk != null || filters.q;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-5 py-3">
      <Select
        label="Provider"
        value={filters.provider ?? ''}
        options={PROVIDERS}
        onChange={(v) => onChange({ ...filters, provider: v || undefined })}
      />
      <Select
        label="Asset class"
        value={filters.cls ?? ''}
        options={ASSET_CLASSES}
        onChange={(v) => onChange({ ...filters, cls: v || undefined })}
      />
      <Select
        label="Risk"
        value={filters.risk != null ? String(filters.risk) : ''}
        options={RISKS.map(String)}
        render={(v) => (v ? `Risk ${v}` : 'Risk')}
        onChange={(v) => onChange({ ...filters, risk: v ? Number(v) : undefined })}
      />
      <div className="relative">
        <input
          type="search"
          value={filters.q ?? ''}
          onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
          placeholder="Search funds…"
          aria-label="Search funds"
          className="h-8 w-56 rounded-sm border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs text-[var(--ink-dim)]">
        <span aria-live="polite" className="tnum">
          {shown} of {total} funds
        </span>
        {active ? (
          <button
            onClick={() => onChange({ q: undefined })}
            className="rounded-sm px-2 py-1 text-[var(--accent)] hover:bg-[var(--accent-wash)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  render,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  render?: (v: string) => string;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-sm border border-[var(--line)] bg-[var(--surface-2)] pl-3 pr-8 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--ink-faint)]"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
