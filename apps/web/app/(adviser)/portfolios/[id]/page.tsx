'use client';

import { useEffect, useState, use } from 'react';
import { getPortfolio, listFundsForPicker, type FundPick } from '../lib/api';
import { Builder } from '../components/Builder';

export default function EditPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<Parameters<typeof Builder>[0]['initial'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { portfolio } = await getPortfolio(id);
        // resolve each holding's fund facts for the builder rows
        const all = await listFundsForPicker();
        const byId = new Map<string, FundPick>(all.funds.map((f) => [f.id, f]));
        const rows = portfolio.holdings.map((h) => ({
          fund: byId.get(h.fundId) ?? { id: h.fundId, name: h.fundId, provider: '', providerColour: null, assetClass: '', riskRating: null },
          weightBp: h.weightBp,
        }));
        if (cancelled) return;
        setInitial({ id: portfolio.id, name: portfolio.name, kind: portfolio.kind, approach: portfolio.approach, rebalancing: portfolio.rebalancing, rows });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (error) {
    return <div data-surface="portfolio" className="-m-8 flex min-h-[calc(100vh)] items-center justify-center text-sm text-[var(--neg)]">{error}</div>;
  }
  if (!initial) {
    return <div data-surface="portfolio" className="-m-8 flex min-h-[calc(100vh)] items-center justify-center text-sm text-[var(--ink-faint)]">Loading…</div>;
  }
  return <Builder initial={initial} />;
}
