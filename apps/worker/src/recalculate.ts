/**
 * Recalculate job logic (build spec §3.3, §6).
 *
 * Loads a data_version's funds + prices, runs each fund's aligned month-end
 * series through @nsights/calc computeFundMetrics(), and upserts fund_metric.
 *
 * This is the real job body. For now a dev script enqueues it; once the admin
 * UI exists (M7), the "Publish" action enqueues the SAME job automatically —
 * no script. Trigger changes; this logic does not.
 *
 * Runs on the OWNER connection (fund data is platform-owned, outside tenant RLS).
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { computeFundMetrics, type DatedSeries, type Series } from '@nsights/calc';

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export interface RecalcResult {
  versionId: string;
  funds: number;
  metricRows: number;
  months: number;
}

/**
 * Build fund_metric rows for one data_version.
 * versionId optional — defaults to the current live version.
 */
export async function recalculateVersion(versionId?: string): Promise<RecalcResult> {
  const client = await getPool().connect();
  try {
    // Resolve version (explicit, else live pointer).
    const vid =
      versionId ??
      (
        await client.query(
          `select live_version_id as id from platform_state where id = 1`,
        )
      ).rows[0]?.id;
    if (!vid) throw new Error('No version to recalculate (no live_version_id set)');

    // Global month-end index for this version (sorted distinct price dates).
    const dateRows = await client.query(
      `select distinct price_date from fund_price
       where version_id = $1 order by price_date`,
      [vid],
    );
    const dates: string[] = dateRows.rows.map((r) => isoDate(r.price_date));
    const dateIndex = new Map(dates.map((d, i) => [d, i]));

    // All funds that have prices in this version.
    const fundRows = await client.query(
      `select distinct fund_id from fund_price where version_id = $1`,
      [vid],
    );

    let metricRows = 0;
    for (const fr of fundRows.rows) {
      const fundId = fr.fund_id as string;

      const prices = await client.query(
        `select price_date, price from fund_price
         where version_id = $1 and fund_id = $2 order by price_date`,
        [vid, fundId],
      );

      // Align into a null-padded series over the global index.
      const series: Series = new Array(dates.length).fill(null);
      for (const row of prices.rows) {
        const idx = dateIndex.get(isoDate(row.price_date));
        if (idx != null) series[idx] = Number(row.price);
      }

      const ds: DatedSeries = { dates, series };
      const metrics = computeFundMetrics(ds);

      await client.query(
        `insert into fund_metric (version_id, fund_id, metrics)
         values ($1, $2, $3)
         on conflict (version_id, fund_id)
         do update set metrics = excluded.metrics`,
        [vid, fundId, JSON.stringify(metrics)],
      );
      metricRows++;
    }

    return { versionId: vid, funds: fundRows.rows.length, metricRows, months: dates.length };
  } finally {
    client.release();
  }
}

/** Normalise a pg date (Date or string) to YYYY-MM-DD. */
function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}