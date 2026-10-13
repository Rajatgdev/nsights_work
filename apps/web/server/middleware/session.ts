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
import { eq, and } from 'drizzle-orm';
import { db, schema } from '@nsights/db';
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

  // Find the membership row (active org if set, else any). Loaded as OWNER-free
  // read: this runs on the app connection but member rows are keyed by user id.
  const rows = await db
    .select({
      firmId: schema.member.organizationId,
      role: schema.member.role,
      canEditHousePortfolios: schema.member.canEditHousePortfolios,
      canDownload: schema.member.canDownload,
      firmStatus: schema.organization.status,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(
      activeOrgId
        ? and(eq(schema.member.userId, user.id), eq(schema.member.organizationId, activeOrgId))
        : eq(schema.member.userId, user.id),
    )
    .limit(1);

  const m = rows[0];
  const membership: FirmMembership | undefined = m
    ? {
        firmId: m.firmId,
        role: m.role,
        canEditHousePortfolios: m.canEditHousePortfolios,
        canDownload: m.canDownload,
        firmStatus: m.firmStatus,
      }
    : undefined;

  return { user, membership };
}