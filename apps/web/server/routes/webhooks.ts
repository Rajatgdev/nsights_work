import { Hono } from 'hono';
import type { AppEnv } from '../context';

export const webhooks = new Hono<AppEnv>();

// POST /api/webhooks/stripe — raw body, signature verified, idempotent via
// stripe_event table (spec §3.5). Implemented in milestone 6.
webhooks.post('/stripe', (c) => c.json({ error: 'not_implemented', milestone: 6 }, 501));
