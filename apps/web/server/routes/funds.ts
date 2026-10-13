import { Hono } from 'hono';
import type { AppEnv } from '../context';

export const funds = new Hono<AppEnv>();

const notImpl = (c: { json: (b: unknown, s: 501) => Response }) =>
  c.json({ error: 'not_implemented', milestone: 3 }, 501);

// GET /api/funds?provider&cls&risk&q   (live version)
funds.get('/', (c) => notImpl(c));
// GET /api/funds/suggestions?ids=
funds.get('/suggestions', (c) => notImpl(c));
// GET /api/funds/:id
funds.get('/:id', (c) => notImpl(c));
// POST /api/charts/:key/data is mounted here for locality of fund data:
funds.post('/charts/:key/data', (c) => notImpl(c));
