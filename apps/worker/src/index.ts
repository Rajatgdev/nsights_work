/**
 * BullMQ worker service (Railway). Consumes the queues defined in
 * @nsights/shared and runs the jobs from the spec pipelines (§3.3 data,
 * §3.4 export, retention). One Worker per queue; each handler is a stub that
 * the relevant milestone fills in.
 */
import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  redisConnectionFromEnv,
  type JobPayloadMap,
} from '@nsights/shared';

const connection = redisConnectionFromEnv();

type Handlers = {
  [K in keyof JobPayloadMap]: (payload: JobPayloadMap[K], job: Job) => Promise<void>;
};

const handlers: Handlers = {
  'validate-upload': async (p) => {
    // milestone 2: fetch file from storage → parse + validate → draft version
    console.log('[validate-upload]', p.uploadId, '(not implemented)');
  },
  recalculate: async (p) => {
    // milestone 2: compute fund_metric rows for version → flip live pointer
    console.log('[recalculate]', p.versionId, '(not implemented)');
  },
  export: async (p) => {
    // milestone 5: build chart PNGs (SSR) → PPTX/PDF → forbidden scan → storage
    console.log('[export]', p.exportId, p.format, '(not implemented)');
  },
  'firm-export': async (p) => {
    // milestone 6/7: GDPR firm data export
    console.log('[firm-export]', p.firmId, '(not implemented)');
  },
  'retention-daily': async (p) => {
    // milestone 6: expire exports, hard-delete firms past delete_after
    console.log('[retention-daily]', p.runDate, '(not implemented)');
  },
};

const workers: Worker[] = [];

for (const name of Object.values(QUEUE_NAMES)) {
  const worker = new Worker(
    name,
    async (job) => {
      const handler = handlers[name as keyof Handlers] as (
        payload: unknown,
        job: Job,
      ) => Promise<void>;
      await handler(job.data, job);
    },
    { connection, concurrency: 5 },
  );
  worker.on('failed', (job, err) => console.error(`[${name}] job ${job?.id} failed:`, err));
  workers.push(worker);
}

console.log(`nSights worker up. Listening on: ${Object.values(QUEUE_NAMES).join(', ')}`);

async function shutdown() {
  console.log('Shutting down workers…');
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
