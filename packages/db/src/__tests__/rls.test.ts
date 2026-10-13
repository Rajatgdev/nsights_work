/**
 * Cross-tenant RLS proof (build spec §4.3 / §13).
 *
 * Seeds two firms (A, B) as the OWNER role, then connects as app_user and
 * proves that with Firm A's context set, Firm B's rows are invisible and
 * cannot be written. Everything is deleted in afterAll — nothing persists.
 *
 * Needs a real database. Skips itself (does not fail) if env is absent, so a
 * machine without DB creds can still run the rest of the suite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const OWNER_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;
const hasEnv = Boolean(OWNER_URL && APP_URL);

// Unique suffix so a crashed run never collides with a later one.
const tag = `rlstest_${randomUUID().slice(0, 8)}`;
const firmA = randomUUID();
const firmB = randomUUID();
const userA = `${tag}_a`;
const userB = `${tag}_b`;
const portA = randomUUID();
const portB = randomUUID();

const owner = hasEnv ? new Pool({ connectionString: OWNER_URL }) : null;
const app = hasEnv ? new Pool({ connectionString: APP_URL }) : null;

/** Run fn inside an app_user transaction with RLS context set (mirrors withTenant). */
async function asFirm<T>(
  firmId: string,
  userId: string,
  role: string,
  fn: (q: (text: string, params?: unknown[]) => Promise<any>) => Promise<T>,
): Promise<T> {
  const client = await app!.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `select set_config('app.firm_id', $1, true),
              set_config('app.user_id', $2, true),
              set_config('app.role', $3, true)`,
      [firmId, userId, role],
    );
    const result = await fn((text, params) => client.query(text, params));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

describe.skipIf(!hasEnv)('RLS cross-tenant isolation', () => {
  beforeAll(async () => {
    // Seed as OWNER (bypasses RLS) — two firms, two users, one house portfolio each.
    await owner!.query(
      `insert into organization (id, name, slug, seat_limit, status)
       values ($1,'Firm A',$2,5,'active'), ($3,'Firm B',$4,5,'active')`,
      [firmA, `${tag}-a`, firmB, `${tag}-b`],
    );
    await owner!.query(
      `insert into "user" (id, email, name) values ($1,$2,'A'), ($3,$4,'B')`,
      [userA, `${userA}@test.local`, userB, `${userB}@test.local`],
    );
    await owner!.query(
      `insert into portfolio (id, firm_id, kind, name) values
       ($1,$2,'house','A house'), ($3,$4,'house','B house')`,
      [portA, firmA, portB, firmB],
    );
  }, 30_000);

  afterAll(async () => {
    if (!hasEnv) return;
    // Clean up everything we created, as OWNER.
    await owner!.query('delete from portfolio where id = any($1)', [[portA, portB]]);
    await owner!.query('delete from "user" where id = any($1)', [[userA, userB]]);
    await owner!.query('delete from organization where id = any($1)', [[firmA, firmB]]);
    await owner!.end();
    await app!.end();
  });

  it('Firm A sees only its own portfolio', async () => {
    const rows = await asFirm(firmA, userA, 'firm_admin', async (q) => {
      const r = await q('select id, firm_id from portfolio');
      return r.rows as { id: string; firm_id: string }[];
    });
    expect(rows.every((r) => r.firm_id === firmA)).toBe(true);
    expect(rows.some((r) => r.id === portA)).toBe(true);
    expect(rows.some((r) => r.id === portB)).toBe(false); // B invisible
  });

  it('Firm A cannot read Firm B even when asking for it by id', async () => {
    const count = await asFirm(firmA, userA, 'firm_admin', async (q) => {
      const r = await q('select count(*)::int as n from portfolio where id = $1', [portB]);
      return r.rows[0].n as number;
    });
    expect(count).toBe(0);
  });

  it('Firm A cannot UPDATE Firm B rows', async () => {
    const updated = await asFirm(firmA, userA, 'firm_admin', async (q) => {
      const r = await q(`update portfolio set name='hacked' where id = $1`, [portB]);
      return r.rowCount as number;
    });
    expect(updated).toBe(0); // RLS makes B's row invisible to the UPDATE
  });

  it('Firm A cannot DELETE Firm B rows', async () => {
    const deleted = await asFirm(firmA, userA, 'firm_admin', async (q) => {
      const r = await q('delete from portfolio where id = $1', [portB]);
      return r.rowCount as number;
    });
    expect(deleted).toBe(0);
  });

  it('Firm A cannot INSERT a row tagged as Firm B (WITH CHECK)', async () => {
    await expect(
      asFirm(firmA, userA, 'firm_admin', async (q) => {
        await q(
          `insert into portfolio (id, firm_id, kind, name) values ($1,$2,'house','sneaky')`,
          [randomUUID(), firmB],
        );
      }),
    ).rejects.toThrow(); // WITH CHECK violation
  });

  it('Firm B, in its own context, sees only its portfolio', async () => {
    const rows = await asFirm(firmB, userB, 'firm_admin', async (q) => {
      const r = await q('select id, firm_id from portfolio');
      return r.rows as { id: string; firm_id: string }[];
    });
    expect(rows.every((r) => r.firm_id === firmB)).toBe(true);
    expect(rows.some((r) => r.id === portB)).toBe(true);
    expect(rows.some((r) => r.id === portA)).toBe(false);
  });
});