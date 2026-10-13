/**
 * BullMQ producers (API side). The worker service consumes these.
 * Queues are created lazily and memoised per process.
 */
import { Queue } from 'bullmq';
import { QUEUE_NAMES, type JobPayloadMap, type QueueName } from '@nsights/shared';

const queues = new Map<QueueName, Queue>();

function connection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  return { url };
}

function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: connection() });
    queues.set(name, q);
  }
  return q;
}

export async function enqueue<N extends QueueName>(
  name: N,
  payload: JobPayloadMap[N],
  opts?: { jobId?: string },
): Promise<void> {
  await getQueue(name).add(name, payload, {
    jobId: opts?.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export { QUEUE_NAMES };
