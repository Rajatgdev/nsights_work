/**
 * Seed loader (spec §12 milestone 2).
 *
 * Loads the prototype dataset (packages/db/data/dataset-default.json) into the
 * shared, platform-owned fund tables. Per decision: seed only the 66 REAL funds,
 * dropping the 6 modelled MyFolio series (est:true).
 *
 * Inserts: provider, fund, data_version (draft→live), fund_price, fund_fact_version.
 * Metrics (fund_metric) are built by the recalculate job, not here.
 *
 * Runs on the OWNER connection (fund data is platform-owned, outside tenant RLS).
 * Run: pnpm --filter @nsights/db seed
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

// Provider brand colours (spec §7).
const PROVIDER_COLOUR: Record<string, string> = {
  Zurich: '#1f64c4',
  'New Ireland': '#2e8b57',
  'Irish Life': '#16a394',
  Aviva: '#caa023',
  'Standard Life': '#2a4a73',
  'Royal London': '#6a4fb3',
};

interface ProtoFund {
  id: string;
  name: string;
  provider: string;
  cls: string;
  risk: number;
  category: string;
  amc: number;
  est?: boolean;
  prices: (number | null)[];
}
interface ProtoDataset {
  source: string;
  updated: string;
  dates: string[];
  funds: ProtoFund[];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Normalise a prototype YYYY-MM-01 date to month-end (spec §5.2 decision). */
function monthEnd(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');

  const datasetPath = resolve(import.meta.dirname, '../../data/dataset-default.json');
  if (!existsSync(datasetPath)) {
    console.log(
      '[seed] packages/db/data/dataset-default.json not found.\n' +
        '       Place the extracted dataset there first (it is gitignored), then re-run.',
    );
    return;
  }
  const data = JSON.parse(readFileSync(datasetPath, 'utf8')) as ProtoDataset;

  // Decision: real funds only (drop modelled MyFolio, est:true).
  const funds = data.funds.filter((f) => !f.est);
  const dropped = data.funds.length - funds.length;
  const dates = data.dates.map(monthEnd);
  const dataMonth = dates[dates.length - 1]!;

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    console.log(`[seed] loading ${funds.length} real funds (dropped ${dropped} modelled), ${dates.length} months.`);
    await client.query('BEGIN');

    // 1) Providers
    const providerNames = [...new Set(funds.map((f) => f.provider))];
    const providerId: Record<string, string> = {};
    for (const name of providerNames) {
      const r = await client.query(
        `insert into provider (name, colour_hex, active)
         values ($1,$2,true)
         on conflict (name) do update set colour_hex = excluded.colour_hex
         returning id`,
        [name, PROVIDER_COLOUR[name] ?? null],
      );
      providerId[name] = r.rows[0].id;
    }

    // 2) A fresh draft data_version for this seed.
    const ver = await client.query(
      `insert into data_version (data_month, status, published_at, parent_version_id)
       values ($1,'draft',now(),null) returning id`,
      [dataMonth],
    );
    const versionId = ver.rows[0].id as string;

    // 3) Funds + prices + facts
    let priceRows = 0;
    for (const f of funds) {
      const fundRes = await client.query(
        `insert into fund (provider_id, external_code, slug, name, asset_class, category, is_estimated)
         values ($1,$2,$3,$4,$5,$6,false)
         on conflict (slug) do update set name = excluded.name
         returning id`,
        [providerId[f.provider], f.id, slugify(f.name), f.name, f.cls, f.category],
      );
      const fundId = fundRes.rows[0].id as string;

      // facts (amc known; risk rating from prototype 'risk')
      await client.query(
        `insert into fund_fact_version (version_id, fund_id, risk_rating, amc_pct)
         values ($1,$2,$3,$4)
         on conflict (version_id, fund_id) do update set risk_rating = excluded.risk_rating, amc_pct = excluded.amc_pct`,
        [versionId, fundId, f.risk, f.amc],
      );

      // prices (skip nulls = pre-launch)
      const values: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      f.prices.forEach((price, i) => {
        if (price == null) return;
        values.push(`($${p++},$${p++},$${p++},$${p++})`);
        params.push(versionId, fundId, dates[i], price);
      });
      if (values.length) {
        // chunk to stay under param limits
        const CHUNK = 500;
        for (let i = 0; i < values.length; i += CHUNK) {
          const vs = values.slice(i, i + CHUNK);
          const ps = params.slice(i * 4, (i + CHUNK) * 4);
          await client.query(
            `insert into fund_price (version_id, fund_id, price_date, price) values ${vs.join(',')}
             on conflict do nothing`,
            ps,
          );
        }
        priceRows += values.length;
      }
    }

    // 4) Flip live pointer to this version (singleton row id=1).
    await client.query(`update data_version set status='live' where id=$1`, [versionId]);
    await client.query(
      `insert into platform_state (id, live_version_id, updated_at)
       values (1,$1,now())
       on conflict (id) do update set live_version_id = excluded.live_version_id, updated_at = now()`,
      [versionId],
    );

    await client.query('COMMIT');
    console.log(`[seed] done. version=${versionId} funds=${funds.length} priceRows=${priceRows} dataMonth=${dataMonth}`);
    console.log('[seed] fund_metric NOT computed here — that is the recalculate job (next step).');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});