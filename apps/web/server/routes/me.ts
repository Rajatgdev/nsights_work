import { Hono } from 'hono';
import type { AppEnv } from '../context';

export const me = new Hono<AppEnv>();

// GET /api/me — user, firm, role, flags, firm status (spec §10)
me.get('/', (c) => {
  const user = c.get('user');
  const membership = c.get('membership');
  return c.json({ user, membership: membership ?? null });
});
