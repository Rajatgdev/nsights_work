import { Hono } from 'hono';
import type { AppEnv } from '../context';
import { requireFirmRole } from '../middleware/guard';

export const billing = new Hono<AppEnv>();
const notImpl = (c: { json: (b: unknown, s: 501) => Response }) =>
  c.json({ error: 'not_implemented', milestone: 6 }, 501);

billing.use('*', requireFirmRole('firm_admin'));

billing.get('/', (c) => notImpl(c));
billing.post('/checkout', (c) => notImpl(c));
billing.post('/portal', (c) => notImpl(c));
