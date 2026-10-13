/**
 * Session + firm-context middleware (build spec §3.2).
 *
 * Pipeline: getSession → load membership (role, flags) + firm.status →
 * block writes on paused/cancelled firms → permission guard (per route) →
 * downstream handlers run inside withTenant() which sets the RLS context.
 *
 * At scaffold stage the Better Auth call is stubbed behind getSession(); the
 * real wiring lands in milestone 1. The SHAPE (what is enforced, in what order)
 * is in place so routes can rely on c.get('user') / c.get('membership').
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../context';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await getSession(c.req.raw);
  if (!session) {
    return c.json({ error: 'unauthenticated' }, 401);
  }

  c.set('user', session.user);
  if (session.membership) {
    c.set('membership', session.membership);

    // Block writes when the firm is not in a writable state (spec §1 lifecycle).
    const writable = ['onboarding', 'trial', 'active', 'past_due'];
    if (
      WRITE_METHODS.has(c.req.method) &&
      !writable.includes(session.membership.firmStatus)
    ) {
      return c.json({ error: 'firm_not_writable', status: session.membership.firmStatus }, 402);
    }
  }

  await next();
});

// ── Stub: replaced by Better Auth in milestone 1 ──────────────
interface StubSession {
  user: AppEnv['Variables']['user'];
  membership?: AppEnv['Variables']['membership'];
}

async function getSession(_req: Request): Promise<StubSession | null> {
  // TODO(milestone-1): auth.api.getSession({ headers }) + load member row.
  // Returning null keeps all authed routes locked until wired.
  return null;
}
