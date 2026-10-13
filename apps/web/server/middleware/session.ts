/**
 * Session + firm-context middleware (build spec §3.2).
 *
 * Pipeline: Better Auth getSession → load membership (role, flags) + firm.status
 * → block writes on paused/cancelled firms → (per-route permission guards) →
 * handlers run inside withTenant() which sets the RLS context.
 *
 * A signed-in user may have NO firm yet (just registered, or a platform admin):
 * that is valid — `membership` is simply absent and firm-scoped routes 403 via
 * their own guards.
 */
import { createMiddleware } from 'hono/factory';
import { sql } from 'drizzle-orm';
import { db } from '@nsights/db';
import type { AppEnv, FirmMembership, SessionUser } from '../context';
import { auth } from '../auth';

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

interface LoadedSession {
  user: SessionUser;
  membership?: FirmMembership;
}

/**
 * Resolve the Better Auth session, then load the active firm membership.
 * The "active firm" is session.activeOrganizationId when set, else the user's
 * first membership.
 */
async function getSession(req: Request): Promise<LoadedSession | null> {
  const result = await auth.api.getSession({ headers: req.headers });
  if (!result?.user) return null;

  const user: SessionUser = {
    id: result.user.id,
    email: result.user.email,
    role: (result.user as { role?: string }).role ?? 'user',
  };

  const activeOrgId = (result.session as { activeOrganizationId?: string })
    .activeOrganizationId;

  // Bootstrap lookup: a user's memberships must be read BEFORE firm context is
  // known, so RLS on `member` would hide them. We call the SECURITY DEFINER
  // function app_user_memberships(), which safely returns only this user's rows.
  const queryResult = await db.execute(
    sql`select firm_id, role, can_edit_house_portfolios, can_download, firm_status
        from app_user_memberships(${user.id})`,
  );
  const allRows = queryResult.rows as {
    firm_id: string;
    role: FirmMembership['role'];
    can_edit_house_portfolios: boolean;
    can_download: boolean;
    firm_status: FirmMembership['firmStatus'];
  }[];

  // Active org if the session names one, else the first membership.
  const picked =
    (activeOrgId && allRows.find((r) => r.firm_id === activeOrgId)) || allRows[0];

  const membership: FirmMembership | undefined = picked
    ? {
        firmId: picked.firm_id,
        role: picked.role,
        canEditHousePortfolios: picked.can_edit_house_portfolios,
        canDownload: picked.can_download,
        firmStatus: picked.firm_status,
      }
    : undefined;

  return { user, membership };
}