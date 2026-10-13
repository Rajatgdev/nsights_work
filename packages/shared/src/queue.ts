/**
 * Job queue definitions — BullMQ + Railway Redis (replaces Upstash QStash).
 *
 * This package only declares queue names and payload types + a connection
 * factory. Producers (API) and the consumer (apps/worker) import these so the
 * contract stays in one place. BullMQ itself is a dependency of the apps, not
 * of @nsights/shared, to keep this package dependency-light.
 */

export const QUEUE_NAMES = {
  validateUpload: 'validate-upload',
  recalculate: 'recalculate',
  export: 'export',
  firmExport: 'firm-export',
  retentionDaily: 'retention-daily',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ── Job payloads ─────────────────────────────────────────────
export interface ValidateUploadJob {
  uploadId: string;
}
export interface RecalculateJob {
  versionId: string;
}
export interface ExportJob {
  exportId: string;
  presentationId: string;
  firmId: string;
  format: 'pptx' | 'pdf';
}
export interface FirmExportJob {
  firmId: string;
  requestedBy: string;
}
export interface RetentionDailyJob {
  /** ISO date the run is for; worker is idempotent per day. */
  runDate: string;
}

export type JobPayloadMap = {
  'validate-upload': ValidateUploadJob;
  recalculate: RecalculateJob;
  export: ExportJob;
  'firm-export': FirmExportJob;
  'retention-daily': RetentionDailyJob;
};

/** Shared BullMQ connection options derived from REDIS_URL. */
export function redisConnectionFromEnv(): { url: string } {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  return { url };
}
