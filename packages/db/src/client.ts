/**
 * Drizzle client over Neon serverless (WebSocket Pool — supports transactions,
 * required for RLS set_config). Spec §2.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
import * as schema from './schema/index.js';

// Node needs a WebSocket implementation for the Neon serverless driver.
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export const db = drizzle(getPool(), { schema });
export type DB = typeof db;

export interface TenantContext {
  firmId: string;
  userId: string;
  role: string; // 'firm_admin' | 'adviser' | 'assistant'
}

/**
 * Run a callback inside a transaction with RLS context variables set
 * transaction-local (set_config(..., true)). Every tenant-scoped request
 * MUST go through this (spec §3.2, §4.3).
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: DB) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.firm_id', ${ctx.firmId}, true),
                 set_config('app.user_id', ${ctx.userId}, true),
                 set_config('app.role', ${ctx.role}, true)`,
    );
    return fn(tx as unknown as DB);
  });
}

export { schema };
export * from './schema/index.js';
