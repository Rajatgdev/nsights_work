'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listPresentations, createPresentation, deletePresentation, type PresentationListItem } from './lib/api';

export default function PresentationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<PresentationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    listPresentations().then((r) => setItems(r.presentations)).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  async function create() {
    setCreating(true);
    try {
      const r = await createPresentation({ title: 'Untitled presentation' });
      router.push(`/presentations/${r.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create'); setCreating(false); }
  }
  async function remove(id: string) { await deletePresentation(id).catch(() => undefined); load(); }

  return (
    <div data-surface="portfolio" className="-m-8 min-h-[calc(100vh)]">
      <header className="flex items-center gap-4 border-b border-[var(--line)] px-6 py-3">
        <h1 className="serif text-xl font-medium text-[var(--ink)]">Presentations</h1>
        <button onClick={create} disabled={creating}
          className="ml-auto rounded-sm bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[#07140f] hover:bg-[var(--accent-deep)] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          {creating ? 'Creating…' : '+ New presentation'}
        </button>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6">
        {error ? <p className="text-sm text-[var(--neg)]">{error}</p> : loading ? (
          <p className="text-sm text-[var(--ink-faint)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-sm border border-[var(--line)] p-8 text-center">
            <p className="serif text-lg text-[var(--ink-dim)]">No presentations yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--ink-faint)]">Build a branded client deck from your funds and portfolios — chart slides, commentary, and export to PowerPoint.</p>
            <button onClick={create} className="mt-4 rounded-sm border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent-wash)]">Build your first deck</button>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line-soft)] rounded-sm border border-[var(--line)]">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => router.push(`/presentations/${p.id}`)} className="min-w-0 flex-1 text-left">
                  <span className="serif text-[15px] text-[var(--ink)]">{p.title}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">
                    {p.slides} slide{p.slides === 1 ? '' : 's'}{p.clientName ? ` · ${p.clientName}` : ''} · {p.templateId} · {p.status}
                  </span>
                </button>
                <button onClick={() => router.push(`/presentations/${p.id}`)} className="rounded-sm px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent-wash)]">Open</button>
                <button onClick={() => remove(p.id)} className="rounded-sm px-2 py-1 text-xs text-[var(--ink-faint)] hover:text-[var(--neg)]">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
