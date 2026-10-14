/**
 * DEV: create a firm (organization) and attach a user to it as firm_admin.
 *
 * Temporary scaffolding until the platform-admin onboarding flow exists (M7).
 * Lets us exercise tenant-scoped features (portfolios, presentations) before
 * firm creation has a UI.
 *
 * Usage:  pnpm --filter @nsights/worker seed-dev-firm <user-email> [firm-name]
 * Needs:  DATABASE_URL(_UNPOOLED). The user must already exist (sign up first).
 *
 * Idempotent: re-running finds the existing firm by slug and the existing
 * membership, and just ensures the user is an active firm_admin.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const email = process.argv[2];
  const firmName = process.argv[3] ?? 'Dev Advisory Firm';
  if (!email) {
    console.error('Usage: pnpm --filter @nsights/worker seed-dev-firm <user-email> [firm-name]');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    const u = await client.query(`select id from "user" where email = $1`, [email]);
    const userId = u.rows[0]?.id as string | undefined;
    if (!userId) throw new Error(`No user with email ${email}. Sign up first.`);

    const slug = slugify(firmName);
    const org = await client.query(
      `insert into organization (name, slug, status, seat_limit)
       values ($1, $2, 'active', 10)
       on conflict (slug) do update set status = 'active'
       returning id`,
      [firmName, slug],
    );
    const firmId = org.rows[0].id as string;

    await client.query(
      `insert into member (organization_id, user_id, role, can_edit_house_portfolios, can_download)
       values ($1, $2, 'firm_admin', true, true)
       on conflict (organization_id, user_id)
       do update set role = 'firm_admin', can_edit_house_portfolios = true`,
      [firmId, userId],
    );

    console.log(`[seed-dev-firm] firm "${firmName}" (${firmId}) — ${email} is firm_admin.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
