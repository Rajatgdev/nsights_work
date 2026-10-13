import { Hono } from 'hono';
import type { AppEnv } from '../context';
import { requirePlatformAdmin } from '../middleware/guard';

export const admin = new Hono<AppEnv>();
const notImpl = (c: { json: (b: unknown, s: 501) => Response }) =>
  c.json({ error: 'not_implemented', milestone: 7 }, 501);

admin.use('*', requirePlatformAdmin());

// Firms
admin.get('/firms', (c) => notImpl(c));
admin.post('/firms', (c) => notImpl(c));
admin.patch('/firms/:id', (c) => notImpl(c)); // seats, pause/resume
admin.post('/firms/:id/first-user', (c) => notImpl(c));
admin.get('/usage', (c) => notImpl(c));

// Data pipeline (spec §3.3)
admin.get('/template.xlsx', (c) => notImpl(c));
admin.post('/uploads/presign', (c) => notImpl(c));
admin.post('/uploads', (c) => notImpl(c));
admin.get('/uploads/:id', (c) => notImpl(c));
admin.get('/versions', (c) => notImpl(c));
admin.get('/versions/:id/diff', (c) => notImpl(c));
admin.post('/versions/:id/publish', (c) => notImpl(c));

// Reference data CRUD
admin.all('/funds', (c) => notImpl(c));
admin.all('/stress-events', (c) => notImpl(c));
admin.all('/forbidden-terms', (c) => notImpl(c));
admin.all('/disclaimers', (c) => notImpl(c));
admin.all('/platform-admins', (c) => notImpl(c));
admin.all('/privacy-requests', (c) => notImpl(c));
admin.get('/audit', (c) => notImpl(c));
