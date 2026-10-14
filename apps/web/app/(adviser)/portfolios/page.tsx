'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listPortfolios, deletePortfolio, type PortfolioListItem } from './lib/api';

export default function PortfoliosPage() {
  const router = useRouter();
  const [items, setItems] = useState<PortfolioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setError(null);
    listPortfolios()
      .then((r) => setItems(r.portfolios))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const house = items.filter((p) => p.kind === 'house');
  const personal = items.filter((p) => p.kind === 'personal');

  async function remove(id: string) {
    await deletePortfolio(id).catch(() => undefined);
    load();
  }

  return (
    <div data-surface="portfolio" className="-m-8 min-h-[calc(100vh)]">
      <header className="flex items-center gap-4 border-b border-[var(--line)] px-6 py-3">
        <h1 className="serif text-xl font-medium text-[var(--ink)]">Portfolios</h1>
        <button
          onClick={() => router.push('/portfolios/new')}
          className="ml-auto rounded-sm bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[#07140f] hover:bg-[var(--accent-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          + New portfolio
        </button>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6">
        {error ? <p className="text-sm text-[var(--neg)]">{error}</p> : loading ? (
          <p className="text-sm text-[var(--ink-faint)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-sm border border-[var(--line)] p-8 text-center">
            <p className="serif text-lg text-[var(--ink-dim)]">No portfolios yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--ink-faint)]">Build a model portfolio from the live fund universe — blended performance, indicative risk class and fund suggestions.</p>
            <button onClick={() => router.push('/portfolios/new')} className="mt-4 rounded-sm border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent-wash)]">Build your first portfolio</button>
          </div>
        ) : (
          <div className="space-y-7">
            <Section title="House portfolios" subtitle="Shared across the firm" items={house} onOpen={(id) => router.push(`/portfolios/${id}`)} onRemove={remove} />
            <Section title="Personal portfolios" subtitle="Yours only" items={personal} onOpen={(id) => router.push(`/portfolios/${id}`)} onRemove={remove} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, subtitle, items, onOpen, onRemove }: {
  title: string; subtitle: string; items: PortfolioListItem[];
  onOpen: (id: string) => void; onRemove: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="serif text-sm font-medium text-[var(--ink)]">{title}</h2>
        <span className="text-[11px] text-[var(--ink-faint)]">{subtitle}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--ink-faint)]">None.</p>
      ) : (
        <ul className="divide-y divide-[var(--line-soft)] rounded-sm border border-[var(--line)]">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => onOpen(p.id)} className="min-w-0 flex-1 text-left">
                <span className="serif text-[15px] text-[var(--ink)]">{p.name}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">
                  {p.holdings} fund{p.holdings === 1 ? '' : 's'}{p.approach ? ` · ${p.approach.replace('-', ' ')}` : ''} · {p.rebalancing}
                </span>
              </button>
              <button onClick={() => onOpen(p.id)} className="rounded-sm px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent-wash)]">Open</button>
              <button onClick={() => onRemove(p.id)} className="rounded-sm px-2 py-1 text-xs text-[var(--ink-faint)] hover:text-[var(--neg)]">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
