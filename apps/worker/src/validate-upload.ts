/**
 * validate-upload job logic (build spec §3.3, §5).
 *
 * Pipeline for one `data_upload`:
 *   1. mark `validating`
 *   2. fetch the .xlsx from storage → parseUploadBuffer (§5.1/§5.2)
 *   3. build a LiveSnapshot from the current live version (history/diff checks)
 *   4. validateUpload() → report (§5.3/§5.4); persist it on the upload row
 *   5. errors    → status `failed`, NO version created
 *      publishable → create a DRAFT data_version (funds + prices + facts),
 *                    link createdVersionId, status `draft`
 *
 * Publishing (flip the live pointer) + recalculate are SEPARATE steps a
 * platform admin triggers after reviewing the draft + warnings — not here.
 * Metrics are built by the recalculate job against the version this creates.
 *
 * Runs on the OWNER connection (fund data is platform-owned, outside tenant RLS).
 */
import { Pool, neonConfig, type PoolClient } from '@neondatabase/serverless';
import ws from 'ws';
import {
  parseUploadBuffer,
  validateUpload,
  ParseError,
  type ParsedUpload,
  type LiveSnapshot,
  type ValidationReport,
} from '@nsights/validation';
import { getStorage } from '@nsights/shared';

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

type Client = PoolClient;

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

/** Normalise a pg date (Date or string) to YYYY-MM-DD. */
function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface ValidateUploadResult {
  uploadId: string;
  status: 'failed' | 'draft';
  errors: number;
  warnings: number;
  createdVersionId: string | null;
}

/**
 * Build the LiveSnapshot the validator compares against, keyed by the fund's
 * external_code (the upload's column header). Empty when there is no live
 * version yet (first-ever upload).
 */
async function loadLiveSnapshot(client: Client): Promise<LiveSnapshot> {
  const live = await client.query(
    `select live_version_id as id from platform_state where id = 1`,
  );
  const vid: string | undefined = live.rows[0]?.id;
  if (!vid) return { dates: [], prices: {}, liveCodes: [], closedCodes: [] };

  const dateRows = await client.query(
    `select distinct price_date from fund_price where version_id = $1 order by price_date`,
    [vid],
  );
  const dates: string[] = dateRows.rows.map((r) => isoDate(r.price_date));
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  // code → aligned price column; closed funds flagged from fund.closed_at.
  const rows = await client.query(
    `select f.external_code as code, f.closed_at as closed_at, p.price_date, p.price
       from fund_price p
       join fund f on f.id = p.fund_id
      where p.version_id = $1
      order by f.external_code, p.price_date`,
    [vid],
  );

  const prices: Record<string, (number | null)[]> = {};
  const closed = new Set<string>();
  for (const r of rows.rows) {
    const code = r.code as string;
    if (!prices[code]) prices[code] = new Array(dates.length).fill(null);
    const idx = dateIndex.get(isoDate(r.price_date));
    if (idx != null) prices[code]![idx] = Number(r.price);
    if (r.closed_at != null) closed.add(code);
  }

  const liveCodes = Object.keys(prices);
  return { dates, prices, liveCodes, closedCodes: [...closed] };
}

/** Insert a DRAFT data_version with funds + prices + facts from the upload. */
async function writeDraftVersion(
  client: Client,
  upload: ParsedUpload,
  uploadId: string,
): Promise<string> {
  const dataMonth = upload.dates[upload.dates.length - 1]!;

  // parent = current live version (for lineage), if any.
  const live = await client.query(
    `select live_version_id as id from platform_state where id = 1`,
  );
  const parentId: string | null = live.rows[0]?.id ?? null;

  const ver = await client.query(
    `insert into data_version (data_month, status, source_upload_id, parent_version_id)
     values ($1, 'draft', $2, $3) returning id`,
    [dataMonth, uploadId, parentId],
  );
  const versionId = ver.rows[0].id as string;

  // Resolve (or create) each fund by external_code; upsert facts + prices.
  for (const fr of upload.funds) {
    // provider
    const prov = await client.query(
      `insert into provider (name, active) values ($1, true)
       on conflict (name) do update set name = excluded.name
       returning id`,
      [fr.provider || 'Unknown'],
    );
    const providerId = prov.rows[0].id as string;

    const fundRes = await client.query(
      `insert into fund (provider_id, external_code, slug, name, asset_class, category, launch_date, closed_at, is_estimated)
       values ($1,$2,$3,$4,$5,$6,$7,$8,false)
       on conflict (slug) do update set name = excluded.name, category = excluded.category
       returning id`,
      [
        providerId,
        fr.code,
        slugify(fr.name || fr.code),
        fr.name || fr.code,
        fr.assetClass || 'Multi-Asset',
        fr.category ?? null,
        fr.launchDate ?? null,
        fr.closed ? dataMonth : null,
      ],
    );
    const fundId = fundRes.rows[0].id as string;

    await client.query(
      `insert into fund_fact_version
         (version_id, fund_id, risk_rating, ongoing_charge_pct, amc_pct, manager, style, region, risk_controlled, sfdr_article, description)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (version_id, fund_id) do update set
         risk_rating = excluded.risk_rating,
         ongoing_charge_pct = excluded.ongoing_charge_pct,
         amc_pct = excluded.amc_pct`,
      [
        versionId, fundId,
        fr.riskRating ?? null,
        fr.ongoingChargePct ?? null,
        fr.amcPct ?? null,
        fr.manager ?? null,
        fr.style ?? null,
        fr.region ?? null,
        fr.riskControlled ?? null,
        fr.sfdrArticle ?? null,
        fr.description ?? null,
      ],
    );

    // prices (skip leading/other nulls)
    const col = upload.prices[fr.code];
    if (!col) continue;
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    col.forEach((price, i) => {
      if (typeof price !== 'number' || Number.isNaN(price)) return;
      values.push(`($${p++},$${p++},$${p++},$${p++})`);
      params.push(versionId, fundId, upload.dates[i], price);
    });
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
  }

  return versionId;
}

export async function processValidateUpload(uploadId: string): Promise<ValidateUploadResult> {
  const client = await getPool().connect();
  try {
    // 1) load upload, mark validating
    const up = await client.query(
      `update data_upload set status = 'validating'
       where id = $1 returning s3_key, filename`,
      [uploadId],
    );
    if (up.rowCount === 0) throw new Error(`data_upload ${uploadId} not found`);
    const s3Key = up.rows[0].s3_key as string;

    // 2) fetch + parse
    let parsed: ParsedUpload;
    try {
      const buffer = await getStorage().get(s3Key);
      parsed = await parseUploadBuffer(buffer);
    } catch (err) {
      // Structural / fetch failure → a single blocking error, status failed.
      const code = err instanceof ParseError ? err.code : 'parse_failed';
      const message = err instanceof Error ? err.message : String(err);
      const report: ValidationReport = {
        errors: [{ severity: 'error', code, message }],
        warnings: [],
        summary: {
          fundsFound: 0,
          monthsCovered: { first: null, last: null, count: 0 },
          fundsWithFullHistory: 0,
          newMonthCount: 0,
          addedFunds: [],
          removedFunds: [],
          changedHistoricalPrices: [],
        },
        publishable: false,
      };
      await client.query(
        `update data_upload set status = 'failed', report = $2 where id = $1`,
        [uploadId, JSON.stringify(report)],
      );
      return { uploadId, status: 'failed', errors: 1, warnings: 0, createdVersionId: null };
    }

    // 3) live snapshot + 4) validate
    const live = await loadLiveSnapshot(client);
    const report = validateUpload(parsed, live);

    // 5) persist outcome
    if (!report.publishable) {
      await client.query(
        `update data_upload set status = 'failed', report = $2 where id = $1`,
        [uploadId, JSON.stringify(report)],
      );
      return {
        uploadId,
        status: 'failed',
        errors: report.errors.length,
        warnings: report.warnings.length,
        createdVersionId: null,
      };
    }

    // publishable (zero errors; warnings allowed) → draft version in one tx.
    await client.query('BEGIN');
    let versionId: string;
    try {
      versionId = await writeDraftVersion(client, parsed, uploadId);
      await client.query(
        `update data_upload set status = 'draft', report = $2, created_version_id = $3 where id = $1`,
        [uploadId, JSON.stringify(report), versionId],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    return {
      uploadId,
      status: 'draft',
      errors: 0,
      warnings: report.warnings.length,
      createdVersionId: versionId,
    };
  } finally {
    client.release();
  }
}