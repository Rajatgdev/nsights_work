# nSights

Multi-tenant SaaS for Irish financial-advisory firms: compare life-company funds,
build model portfolios, and download branded PowerPoint/PDF client decks with
per-chart commentary.

Built to `nsights-build-spec.md` (Phase 1), with hosting adapted to
**Vercel + Railway** (no AWS): S3 → Railway Volume, Upstash QStash → BullMQ + Railway Redis.

## Stack

- **TypeScript** everywhere, strict. **pnpm + Turborepo** monorepo.
- **Web**: Next.js 15 (App Router) on **Vercel** (`fra1`), with **Hono** API mounted
  at `app/api/[[...route]]` — one deploy, same origin.
- **Backend services** on **Railway**: `worker` (BullMQ) + `pdf-renderer` (Playwright).
- **DB**: Neon Postgres (Frankfurt) + Drizzle ORM + Row-Level Security.
- **Auth**: Better Auth (organization + admin + TOTP 2FA).
- **Jobs**: BullMQ + Railway Redis. **Storage**: Railway Volume (signed app routes).
- **Charts**: ECharts (screen + SSR export). **Decks**: PptxGenJS + Playwright PDF.
- **Billing**: Stripe. **Email**: Postmark. **AI**: Vertex Gemini (EU). **Monitoring**: Sentry.

## Layout

```
apps/
  web/           Next.js UI + Hono API + /render + signed /files routes
  worker/        BullMQ consumer (validate, recalc, export, retention)
  pdf-renderer/  Playwright/Chromium PDF service
packages/
  shared/      constants, zod schemas, storage interface, queue contracts
  db/          Drizzle schema, RLS (rls.sql), seed loader
  calc/        pure calc engine (§6) + golden tests
  charts/      chart registry (§7)
  export/      theme tokens, SSR chart render, forbidden-term scan
  commentary/  AI prompt + numbers validator (§8)
  auth/        Better Auth config
  billing/     Stripe helpers
  ui/          shared React helpers
```

## Develop

```bash
pnpm install
cp .env.example .env          # fill in Neon, Redis, etc.
pnpm db:generate && pnpm db:migrate   # then apply packages/db/rls.sql
pnpm dev                      # turbo: web (+ worker/pdf-renderer dev)
pnpm typecheck && pnpm test   # all green
```

## Deploy

See `docs/DEPLOYMENT.md` for the Vercel + Railway topology and first-deploy order.

## Status

Scaffold complete and verified: typecheck (21 tasks), tests (calc + commentary),
`next build`, and both Railway services compile; API health + auth + signed-file
routes respond correctly. Feature work proceeds per the milestone plan in the
build spec §12. API endpoints are wired and return `501 {milestone}` until built.
