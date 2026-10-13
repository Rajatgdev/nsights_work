# Deferred work

Intentionally postponed items, with the reason and the milestone where each is
picked up. Committed to the repo so a fresh clone always sees what's outstanding.
Add to this as decisions are made; remove an item only when it's actually done.

| # | Item | Why deferred | Pick up in | Added |
|---|------|--------------|-----------|-------|
| 1 | **2FA enforcement for `platform_admin` + `firm_admin`** | The `twoFactor` plugin (TOTP) is wired and its endpoints work (Stage 3 / M1). But the *enforcement* — blocking those two roles from acting until 2FA is enrolled — guards users that don't exist yet. Platform/firm admins are first created during admin onboarding. Writing the rule now would be untestable scaffolding. | **M7** (platform admin + onboarding) — add the enforcement and test it with a real admin account. | 2026-10-13 |

## Notes per item

### 1 — 2FA enforcement
- **What exists now:** `twoFactor({ issuer: 'nSights' })` plugin in `apps/web/server/auth.ts`. Enroll / verify / disable endpoints are live under `/api/auth/two-factor/*`.
- **What's missing:** middleware/guard that requires `two_factor_enabled = true` before a `platform_admin` or `firm_admin` can use protected routes (spec §2, §14).
- **Where it goes:** session middleware or the `requirePlatformAdmin` / `requireFirmRole` guards (`apps/web/server/middleware/`), once those roles are assigned at onboarding.
- **Spec references:** §2 (auth plugins, 2FA required for those roles), §14 (security checklist — "2FA mandatory for platform_admin and firm_admin").