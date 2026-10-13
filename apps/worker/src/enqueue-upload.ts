/**
 * DEV trigger: stage a real .xlsx and enqueue a validate-upload job.
 *
 * Temporary scaffolding. Once the platform-admin upload UI exists (M7), the
 * admin "Upload" action does all of this (store file → data_upload row →
 * enqueue) — this script is then unnecessary. The job logic it exercises is
 * the real one.
 *
 * What it does:
 *   1. reads the .xlsx at <path>
 *   2. puts it in storage under uploads/{uploadId}/{filename}
 *   3. inserts a `data_upload` row (status pending)
 *   4. enqueues validate-upload { uploadId }
 *
 * Usage:   pnpm --filter @nsights/worker enqueue-upload <path-to.xlsx>
 * Needs:   Redis (REDIS_URL), DATABASE_URL(_UNPOOLED), STORAGE_DIR, and the
 *          worker process running to consume the job. A user row must exist
 *          (uploaded_by FK); set UPLOAD_USER_ID to pin one, else the first user.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Queue } from 'bullmq';
import { config } from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import {
  QUEUE_NAMES,
  redisConnectionFromEnv,
  getStorage,
  STORAGE_PREFIX,
} from '@nsights/shared';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: pnpm --filter @nsights/worker enqueue-upload <path-to.xlsx>');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');

  const bytes = readFileSync(resolve(process.cwd(), path));
  const filename = basename(path);
  const uploadId = randomUUID();
  const key = `${STORAGE_PREFIX.uploads}/${uploadId}/${filename}`;

  // 1) store the file
  await getStorage().put(key, bytes, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  console.log(`[enqueue-upload] stored ${bytes.length} bytes at ${key}`);

  // 2) data_upload row (needs an existing user for uploaded_by)
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    const who =
      process.env.UPLOAD_USER_ID ??
      (await client.query(`select id from "user" order by created_at limit 1`)).rows[0]?.id;
    if (!who) throw new Error('No user row found (and UPLOAD_USER_ID not set) for uploaded_by.');

    await client.query(
      `insert into data_upload (id, uploaded_by, s3_key, filename, status)
       values ($1, $2, $3, $4, 'pending')`,
      [uploadId, who, key, filename],
    );
    console.log(`[enqueue-upload] data_upload row ${uploadId} (uploaded_by=${who})`);
  } finally {
    client.release();
    await pool.end();
  }

  // 3) enqueue
  const queue = new Queue(QUEUE_NAMES.validateUpload, { connection: redisConnectionFromEnv() });
  const job = await queue.add(QUEUE_NAMES.validateUpload, { uploadId });
  console.log(`[enqueue-upload] validate-upload job queued: ${job.id} (uploadId=${uploadId})`);
  await queue.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});