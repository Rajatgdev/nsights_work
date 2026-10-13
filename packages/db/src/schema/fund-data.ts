/**
 * Fund data — shared, platform-owned. NO firm_id, NOT under tenant RLS (spec §4.2).
 */
import {
  boolean,
  date,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { baseColumns } from './_shared';
import { assetClass, dataUploadStatus, dataVersionStatus } from './enums';
import { user } from './auth';

export const provider = pgTable('provider', {
  ...baseColumns,
  name: text('name').notNull().unique(),
  colourHex: text('colour_hex'),
  active: boolean('active').notNull().default(true),
});

export const fund = pgTable('fund', {
  ...baseColumns,
  providerId: uuid('provider_id')
    .notNull()
    .references(() => provider.id),
  externalCode: text('external_code').notNull(), // hidden, platform only
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  assetClass: assetClass('asset_class').notNull(),
  category: text('category'),
  launchDate: date('launch_date'),
  closedAt: date('closed_at'),
  isEstimated: boolean('is_estimated').notNull().default(false),
});

export const dataUpload = pgTable('data_upload', {
  ...baseColumns,
  uploadedBy: text('uploaded_by')
    .notNull()
    .references(() => user.id),
  s3Key: text('s3_key').notNull(), // storage key on Railway volume
  filename: text('filename').notNull(),
  status: dataUploadStatus('status').notNull().default('pending'),
  report: jsonb('report'), // { errors[], warnings[], summary }
  createdVersionId: uuid('created_version_id'),
});

export const dataVersion = pgTable('data_version', {
  ...baseColumns,
  dataMonth: date('data_month').notNull(), // last price date
  status: dataVersionStatus('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: text('published_by').references(() => user.id),
  sourceUploadId: uuid('source_upload_id'),
  parentVersionId: uuid('parent_version_id'),
});

/** Singleton pointer row: current live version. Flip in one tx. */
export const platformState = pgTable('platform_state', {
  id: smallint('id').primaryKey().default(1), // always 1
  liveVersionId: uuid('live_version_id').references(() => dataVersion.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fundPrice = pgTable(
  'fund_price',
  {
    versionId: uuid('version_id')
      .notNull()
      .references(() => dataVersion.id, { onDelete: 'cascade' }),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => fund.id),
    priceDate: date('price_date').notNull(),
    price: numeric('price', { precision: 18, scale: 6 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.fundId, t.priceDate] })],
);

export const fundFactVersion = pgTable(
  'fund_fact_version',
  {
    versionId: uuid('version_id')
      .notNull()
      .references(() => dataVersion.id, { onDelete: 'cascade' }),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => fund.id),
    riskRating: smallint('risk_rating'), // provider SRI 1–7
    ongoingChargePct: numeric('ongoing_charge_pct', { precision: 8, scale: 4 }),
    amcPct: numeric('amc_pct', { precision: 8, scale: 4 }),
    manager: text('manager'),
    style: text('style'),
    region: text('region'),
    riskControlled: boolean('risk_controlled'),
    sfdrArticle: smallint('sfdr_article'),
    description: text('description'),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.fundId] })],
);

export const fundMetric = pgTable(
  'fund_metric',
  {
    versionId: uuid('version_id')
      .notNull()
      .references(() => dataVersion.id, { onDelete: 'cascade' }),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => fund.id),
    metrics: jsonb('metrics').notNull(), // precomputed per §6
  },
  (t) => [primaryKey({ columns: [t.versionId, t.fundId] })],
);

/** Platform-admin editable stress windows (spec §6.4). */
export const stressEvent = pgTable('stress_event', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  active: boolean('active').notNull().default(true),
});

/** Forbidden terms (price-source names/codes) scanned on export (spec §9). */
export const forbiddenTerm = pgTable('forbidden_term', {
  ...baseColumns,
  term: text('term').notNull().unique(),
});
