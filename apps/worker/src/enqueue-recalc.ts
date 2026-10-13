/**
 * DEV trigger: enqueue a recalculate job for the current live version.
 *
 * Temporary scaffolding. Once the admin UI exists (M7), the Publish action
 * enqueues the same job — this script is then unnecessary.
 *
 * Usage: pnpm --filter @nsights/worker recalc
 * Needs: Redis running (REDIS_URL), and the worker process running to consume it.
 */
import { Queue } from 'bullmq';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { QUEUE_NAMES, redisConnectionFromEnv } from '@nsights/shared';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const queue = new Queue(QUEUE_NAMES.recalculate, { connection: redisConnectionFromEnv() });
  // versionId omitted → worker recalculates the live version.
  const job = await queue.add(QUEUE_NAMES.recalculate, {} as { versionId?: string });
  console.log(`[enqueue] recalculate job queued: ${job.id}`);
  await queue.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});