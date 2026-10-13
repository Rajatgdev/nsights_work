/** Firm config + billing (spec §4.2). Tenant-scoped (firm_id = organization.id). */
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { baseColumns } from './_shared';
import { organization, user } from './auth';
import { templateIdEnumValues } from './_literals';

export const firmSettings = pgTable('firm_settings', {
  firmId: uuid('firm_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  tagline: text('tagline'),
  logoS3Key: text('logo_s3_key'), // storage key (Railway volume)
  accentHex: text('accent_hex').default('#16a394'),
  templateId: text('template_id', { enum: templateIdEnumValues }).default('boardroom'),
  paletteId: text('palette_id').default('default'),
  disclaimerText: text('disclaimer_text'),
  showSlideNumbers: boolean('show_slide_numbers').notNull().default(true),
  priceDateMeans: text('price_date_means', {
    enum: ['month_end', 'month_start'],
  }).default('month_end'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teamMember = pgTable('team_member', {
  ...baseColumns,
  firmId: uuid('firm_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  title: text('title'),
  bio: text('bio'),
  photoS3Key: text('photo_s3_key'),
  sort: integer('sort').notNull().default(0),
});

export const firmProfile = pgTable('firm_profile', {
  firmId: uuid('firm_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  philosophy: text('philosophy'),
  strategy: text('strategy'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const termsAcceptance = pgTable('terms_acceptance', {
  ...baseColumns,
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  termsVersion: text('terms_version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  ip: text('ip'),
});

export const subscription = pgTable('subscription', {
  ...baseColumns,
  firmId: uuid('firm_id')
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  status: text('status'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  seatsBilled: integer('seats_billed').notNull().default(0),
});

export const stripeEvent = pgTable('stripe_event', {
  id: text('id').primaryKey(), // stripe event id (idempotency)
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});
