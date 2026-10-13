import { pgEnum } from 'drizzle-orm/pg-core';

export const firmStatus = pgEnum('firm_status', [
  'onboarding',
  'trial',
  'active',
  'past_due',
  'paused',
  'cancelled',
]);

export const firmRole = pgEnum('firm_role', ['firm_admin', 'adviser', 'assistant']);

export const assetClass = pgEnum('asset_class', [
  'Equity',
  'Multi-Asset',
  'Bond',
  'Property',
  'Cash',
]);

export const dataUploadStatus = pgEnum('data_upload_status', [
  'pending',
  'validating',
  'failed',
  'draft',
  'published',
  'discarded',
]);

export const dataVersionStatus = pgEnum('data_version_status', ['draft', 'live', 'superseded']);

export const portfolioKind = pgEnum('portfolio_kind', ['house', 'personal']);

export const portfolioApproach = pgEnum('portfolio_approach', [
  'core-satellite',
  'equal-weighted',
  'multi-manager',
  'multi-strategy',
]);

export const rebalancing = pgEnum('rebalancing', ['monthly', 'buy-and-hold']);

export const holdingRole = pgEnum('holding_role', ['core', 'satellite']);

export const presentationStatus = pgEnum('presentation_status', ['draft', 'final']);

export const compareMode = pgEnum('compare_mode', ['common', 'own']);

export const slideKind = pgEnum('slide_kind', [
  'cover',
  'chart',
  'summary',
  'portfolio',
  'team',
  'philosophy',
  'strategy',
  'disclaimer',
]);

export const exportFormat = pgEnum('export_format', ['pptx', 'pdf']);

export const exportStatus = pgEnum('export_status', [
  'queued',
  'running',
  'ready',
  'failed',
  'expired',
]);

export const privacyRequestKind = pgEnum('privacy_request_kind', ['erase', 'export']);
export const privacyRequestStatus = pgEnum('privacy_request_status', [
  'open',
  'in_progress',
  'done',
]);
