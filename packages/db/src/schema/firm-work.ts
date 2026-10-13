/** Tenant tables — all carry firm_id NOT NULL and are protected by RLS (spec §4.2/§4.3). */
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { baseColumns } from './_shared.js';
import {
  compareMode,
  exportFormat,
  exportStatus,
  holdingRole,
  portfolioApproach,
  portfolioKind,
  presentationStatus,
  privacyRequestKind,
  privacyRequestStatus,
  rebalancing,
  slideKind,
} from './enums.js';
import { organization, user } from './auth.js';
import { fund, dataVersion } from './fund-data.js';
import { templateIdEnumValues } from './_literals.js';

export const portfolio = pgTable('portfolio', {
  ...baseColumns,
  firmId: uuid('firm_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  ownerUserId: text('owner_user_id').references(() => user.id), // null = house
  kind: portfolioKind('kind').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  approach: portfolioApproach('approach'),
  rebalancing: rebalancing('rebalancing').notNull().default('monthly'),
});

export const portfolioHolding = pgTable(
  'portfolio_holding',
  {
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolio.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id') // denormalised for RLS
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => fund.id),
    weightBp: integer('weight_bp').notNull(), // basis points, sum = 10000
    role: holdingRole('role'),
  },
  (t) => [primaryKey({ columns: [t.portfolioId, t.fundId] })],
);

export const presentation = pgTable('presentation', {
  ...baseColumns,
  firmId: uuid('firm_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  title: text('title').notNull(),
  clientName: text('client_name'), // personal data
  adviserName: text('adviser_name'),
  dataVersionId: uuid('data_version_id')
    .notNull()
    .references(() => dataVersion.id), // pinned
  templateId: text('template_id', { enum: templateIdEnumValues }).notNull().default('boardroom'),
  paletteId: text('palette_id').notNull().default('default'),
  compareMode: compareMode('compare_mode').notNull().default('common'),
  status: presentationStatus('status').notNull().default('draft'),
});

export const slide = pgTable('slide', {
  ...baseColumns,
  presentationId: uuid('presentation_id')
    .notNull()
    .references(() => presentation.id, { onDelete: 'cascade' }),
  firmId: uuid('firm_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  kind: slideKind('kind').notNull(),
  chartKey: text('chart_key'),
  fundIds: uuid('fund_ids').array(),
  portfolioId: uuid('portfolio_id').references(() => portfolio.id),
  options: jsonb('options'),
  commentaryEnabled: boolean('commentary_enabled').notNull().default(true),
  commentaryText: text('commentary_text'),
  commentaryEdited: boolean('commentary_edited').notNull().default(false),
  commentaryGenerated: text('commentary_generated'),
  commentaryModel: text('commentary_model'),
});

export const exportRecord = pgTable('export', {
  ...baseColumns,
  presentationId: uuid('presentation_id')
    .notNull()
    .references(() => presentation.id, { onDelete: 'cascade' }),
  firmId: uuid('firm_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  requestedBy: text('requested_by')
    .notNull()
    .references(() => user.id),
  format: exportFormat('format').notNull(),
  status: exportStatus('status').notNull().default('queued'),
  s3Key: text('s3_key'), // storage key once ready
  dataVersionId: uuid('data_version_id')
    .notNull()
    .references(() => dataVersion.id),
  checksum: text('checksum'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

/** Append-only. Grant revokes UPDATE/DELETE in rls.sql. firm_id null = platform event. */
export const auditLog = pgTable('audit_log', {
  ...baseColumns,
  firmId: uuid('firm_id').references(() => organization.id, { onDelete: 'set null' }),
  actorUserId: text('actor_user_id').references(() => user.id),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  meta: jsonb('meta'),
  ip: text('ip'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const privacyRequest = pgTable('privacy_request', {
  ...baseColumns,
  firmId: uuid('firm_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  subjectEmail: text('subject_email').notNull(),
  kind: privacyRequestKind('kind').notNull(),
  status: privacyRequestStatus('status').notNull().default('open'),
  handledBy: text('handled_by').references(() => user.id),
  handledAt: timestamp('handled_at', { withTimezone: true }),
});

/** Platform-admin time-boxed support view into a firm (spec §1). */
export const supportGrant = pgTable('support_grant', {
  ...baseColumns,
  firmId: uuid('firm_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  grantedBy: text('granted_by')
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
