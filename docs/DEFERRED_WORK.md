# Deferred work

Intentionally postponed items, with the reason and the milestone where each is
picked up. Committed to the repo so a fresh clone always sees what's outstanding.
Add to this as decisions are made; remove an item only when it's actually done.

| # | Item | Why deferred | Pick up in | Added |
|---|------|--------------|-----------|-------|
| 1 | **2FA enforcement for `platform_admin` + `firm_admin`** | The `twoFactor` plugin (TOTP) is wired and its endpoints work (Stage 3 / M1). But the *enforcement* — blocking those two roles from acting until 2FA is enrolled — guards users that don't exist yet. Platform/firm admins are first created during admin onboarding. Writing the rule now would be untestable scaffolding. | **M7** (platform admin + onboarding) — add the enforcement and test it with a real admin account. | 2026-10-13 |
| 2 | **RLS test in CI** | CI (M1 Stage 4) runs typecheck + the no-DB unit tests only. The cross-tenant RLS test needs a live Postgres, which a bare GitHub Actions runner doesn't have. It already passed once against the real Neon DB and self-skips when no DB env is present. | When DB-backed CI is worth the setup — add a Postgres service to the workflow, run migrations + `rls.sql`, then `rls-check`. | 2026-10-13 |
| 3 | **Postmark email activation** | Transactional email (`sendEmail`) is wired to Postmark but kept off: `EMAIL_ENABLED=false` logs to console instead of sending, and `requireEmailVerification: false` so sign-up needs no email. The Postmark server/sender signature isn't verified yet. | **~M6** (billing/invites) or whenever email verification is wanted — verify a Postmark sender signature/domain, then set `EMAIL_ENABLED=true` and flip `requireEmailVerification: true`. | 2026-10-13 |

## Notes per item

### 1 — 2FA enforcement
- **What exists now:** `twoFactor({ issuer: 'nSights' })` plugin in `apps/web/server/auth.ts`. Enroll / verify / disable endpoints are live under `/api/auth/two-factor/*`.
- **What's missing:** middleware/guard that requires `two_factor_enabled = true` before a `platform_admin` or `firm_admin` can use protected routes (spec §2, §14).
- **Where it goes:** session middleware or the `requirePlatformAdmin` / `requireFirmRole` guards (`apps/web/server/middleware/`), once those roles are assigned at onboarding.
- **Spec references:** §2 (auth plugins, 2FA required for those roles), §14 (security checklist — "2FA mandatory for platform_admin and firm_admin").

### 2 — RLS test in CI
- **What exists now:** `.github/workflows/ci.yml` runs `pnpm install` → `turbo typecheck` → `turbo test`. The RLS test (`packages/db/src/__tests__/rls.test.ts`) self-skips when `DATABASE_URL` is absent, so CI stays green without a DB.
- **What's missing:** a Postgres service in the workflow (e.g. `services: postgres:` or a Neon test branch), then run `db:migrate` + `apply-rls`, set `DATABASE_URL`/`DATABASE_URL_UNPOOLED`/`APP_DB_PASSWORD`, and run `pnpm --filter @nsights/db rls-check`.
- **Why it matters:** proves tenant isolation on every push, not just the one manual run.

### 3 — Postmark email activation
- **What exists now:** `apps/web/server/email.ts` posts to Postmark when `EMAIL_ENABLED=true`, else logs to console. Called by Better Auth for verification, password reset, and member invitations.
- **What's missing:** a verified Postmark sender signature/domain (DKIM/SPF), then env flips: `EMAIL_ENABLED=true`, and `requireEmailVerification: true` in `apps/web/server/auth.ts` if email confirmation is wanted.
- **Spec references:** §2 (Postmark, DKIM/SPF/Return-Path on client domain).