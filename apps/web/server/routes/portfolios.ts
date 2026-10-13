import { Hono } from 'hono';
import type { AppEnv } from '../context';

export const portfolios = new Hono<AppEnv>();
const notImpl = (c: { json: (b: unknown, s: 501) => Response }) =>
  c.json({ error: 'not_implemented', milestone: 4 }, 501);

portfolios.get('/', (c) => notImpl(c));
portfolios.post('/', (c) => notImpl(c));
portfolios.get('/:id', (c) => notImpl(c));
portfolios.patch('/:id', (c) => notImpl(c));
portfolios.delete('/:id', (c) => notImpl(c));
portfolios.post('/:id/analyse', (c) => notImpl(c)); // blend metrics, risk class, warnings
portfolios.post('/suggest', (c) => notImpl(c)); // rules engine
