/**
 * Better Auth configuration (spec §2): organization + admin + twoFactor.
 * 2FA (TOTP) required for platform_admin and firm_admin. Rate-limit + lockout on.
 *
 * The concrete `betterAuth()` wiring binds to our Drizzle instance in apps/web
 * (so it shares the same pooled connection and request lifecycle). This package
 * exports the shared options factory + role/permission helpers used everywhere.
 */
import { FIRM_ROLES, MAX_FIRM_ADMINS, type FirmRole } from '@nsights/shared';

export const authConfig = {
  requireTwoFactorFor: ['platform_admin', 'firm_admin'] as const,
  rateLimit: { enabled: true, window: 60, max: 20 },
  session: { cookieCache: true, sameSite: 'lax' as const },
  maxFirmAdmins: MAX_FIRM_ADMINS,
};

export function isFirmRole(role: string): role is FirmRole {
  return (FIRM_ROLES as readonly string[]).includes(role);
}

export function isPlatformAdmin(userRole: string): boolean {
  return userRole === 'platform_admin';
}

/**
 * Build the Better Auth instance. Kept as a factory taking the db + adapters so
 * apps/web can inject its Drizzle instance without a circular import.
 *
 * NOTE: the full plugin wiring (drizzleAdapter, organization, admin, twoFactor)
 * is completed in apps/web/server/auth.ts during milestone 1.
 */
export type AuthOptions = typeof authConfig;
