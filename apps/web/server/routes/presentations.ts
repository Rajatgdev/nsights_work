import { Hono } from 'hono';
import type { AppEnv } from '../context';
import { requireDownload } from '../middleware/guard';

export const presentations = new Hono<AppEnv>();
const notImpl = (c: { json: (b: unknown, s: 501) => Response }) =>
  c.json({ error: 'not_implemented', milestone: 5 }, 501);

presentations.get('/', (c) => notImpl(c));
presentations.post('/', (c) => notImpl(c));
presentations.get('/:id', (c) => notImpl(c));
presentations.patch('/:id', (c) => notImpl(c));
presentations.delete('/:id', (c) => notImpl(c));
presentations.post('/:id/slides', (c) => notImpl(c));
presentations.post('/:id/reorder', (c) => notImpl(c));
presentations.post('/:id/refresh-data', (c) => notImpl(c));
// Export requires can_download flag (spec §1)
presentations.post('/:id/export', requireDownload(), (c) => notImpl(c));

// Slide + commentary endpoints (flat paths per spec §10)
presentations.patch('/slides/:id', (c) => notImpl(c));
presentations.post('/slides/:id/commentary/generate', (c) => notImpl(c));
presentations.post('/slides/:id/commentary/reset', (c) => notImpl(c));

// Export polling
presentations.get('/exports/:id', (c) => notImpl(c));
