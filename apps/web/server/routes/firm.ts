import { Hono } from 'hono';
import type { AppEnv } from '../context';
import { requireFirmRole } from '../middleware/guard';

export const firm = new Hono<AppEnv>();
const notImpl = (c: { json: (b: unknown, s: 501) => Response }) =>
  c.json({ error: 'not_implemented', milestone: 6 }, 501);

// Settings / profile / team / assets — firm_admin only
firm.use('*', requireFirmRole('firm_admin'));

firm.get('/settings', (c) => notImpl(c));
firm.patch('/settings', (c) => notImpl(c));
firm.get('/profile', (c) => notImpl(c));
firm.patch('/profile', (c) => notImpl(c));
firm.get('/team', (c) => notImpl(c));
firm.post('/team', (c) => notImpl(c));
firm.patch('/team/:id', (c) => notImpl(c));
firm.delete('/team/:id', (c) => notImpl(c));
firm.post('/assets/presign', (c) => notImpl(c)); // → signed app upload route

// Members / invites
firm.get('/members', (c) => notImpl(c));
firm.post('/invitations', (c) => notImpl(c));
firm.patch('/members/:id', (c) => notImpl(c));
firm.delete('/members/:id', (c) => notImpl(c));
