/**
 * Hono API app, mounted inside Next.js at app/api/[[...route]]/route.ts
 * via hono/vercel. Same origin as the UI → no CORS, same-site cookies.
 *
 * Route tree mirrors the API surface in build spec §10.
 */
import { Hono } from 'hono';
import type { AppEnv } from './context';
import { sessionMiddleware } from './middleware/session';
import { me } from './routes/me';
import { funds } from './routes/funds';
import { portfolios } from './routes/portfolios';
import { presentations } from './routes/presentations';
import { firm } from './routes/firm';
import { billing } from './routes/billing';
import { admin } from './routes/admin';
import { webhooks } from './routes/webhooks';
import { auth } from './auth';

export const app = new Hono<AppEnv>().basePath('/api');

// Health check (no auth)
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

// Webhooks need the RAW body + no session; mount before session middleware.
app.route('/webhooks', webhooks);

// Better Auth: sign-up / sign-in / sign-out / org endpoints. No session required
// (signing in is how you GET a session), so mount before the session middleware.
app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

// Everything below is authenticated.
app.use('*', sessionMiddleware);

app.route('/me', me);
app.route('/funds', funds);
app.route('/portfolios', portfolios);
app.route('/presentations', presentations);
app.route('/firm', firm);
app.route('/billing', billing);
app.route('/admin', admin);

export type AppType = typeof app;
