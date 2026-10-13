/**
 * Permission guards derived from the spec §1 permission matrix.
 * Used per-route to enforce role/flag before a handler runs.
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../context';
import type { FirmRole } from '@nsights/shared';

export function requirePlatformAdmin() {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('user').role !== 'platform_admin') {
      return c.json({ error: 'forbidden' }, 403);
    }
    await next();
  });
}

export function requireFirmRole(...roles: FirmRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const m = c.get('membership');
    if (!m || !roles.includes(m.role)) {
      return c.json({ error: 'forbidden' }, 403);
    }
    await next();
  });
}

export function requireDownload() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const m = c.get('membership');
    if (!m || !m.canDownload) {
      return c.json({ error: 'download_not_permitted' }, 403);
    }
    await next();
  });
}
