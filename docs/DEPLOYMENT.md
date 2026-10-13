# nSights — deployment (Vercel + Railway)

Adapts the build spec's AWS/Vercel topology to **Vercel (web) + Railway (backend services)**.
No AWS account required. S3 → Railway Volume; Upstash QStash → BullMQ + Railway Redis.

## Service map

| Service | Platform | Build | Notes |
|---|---|---|---|
| `web` (Next.js + Hono API + /render) | **Vercel** | `apps/web` | Region `fra1`. Serves UI, API, signed file routes, deck render HTML. |
| `worker` (BullMQ consumer) | **Railway** | `apps/worker/Dockerfile` | Validation, recalc, export, retention jobs. Mounts the volume. |
| `pdf-renderer` (Playwright) | **Railway** | `apps/pdf-renderer/Dockerfile` | Headless Chromium; renders deck PDFs. Private network only. |
| Postgres | **Neon** (Frankfurt) | — | Scale-to-zero OFF in prod. Branch per env/PR. |
| Redis | **Railway** plugin | — | BullMQ backing store. |
| Volume | **Railway** | — | Persistent disk mounted at `STORAGE_DIR` on `worker` (and `web` if it writes). |

## Storage (replaces S3)

Files live on a Railway **Volume** mounted at `STORAGE_DIR` (e.g. `/data/storage`).
They are private — there are no public URLs. The web app serves bytes through
`GET /files/:token`, where the token is an HMAC (`RENDER_TOKEN_SECRET`) over
`key|expiry`, valid 15 minutes. Prefixes mirror the spec §4.4: `uploads/`,
`assets/`, `exports/`.

> Vercel's filesystem is ephemeral, so the **volume-backed services run on
> Railway**. The web app on Vercel reads/writes storage by calling the worker
> (or a small storage endpoint on a Railway service) rather than touching a
> local disk. Swapping to S3/R2 later = implement one `Storage` driver in
> `packages/shared/src/storage` and set `STORAGE_DRIVER=s3`.

## Jobs (replaces QStash)

`packages/shared/src/queue.ts` declares queue names + payload types.
Producers call `enqueue()` (`apps/web/server/queue.ts`); the `worker` consumes.
Scheduled jobs (monthly recalc reminder, daily retention) use **Railway Cron**
services that enqueue a job, or BullMQ repeatable jobs.

## Environment

Copy `.env.example`. Set per-service in Railway/Vercel dashboards.
`REDIS_URL`, `STORAGE_DIR`, `PDF_RENDERER_URL` are Railway-internal.
`DATABASE_URL` (pooled) for the app; `DATABASE_URL_UNPOOLED` for migrations + RLS.

## First deploy order

1. Neon project + `dev`/`prod` branches. Run migrations + `rls.sql`.
2. Railway project: add Redis plugin, create a Volume, deploy `worker` + `pdf-renderer`.
3. Vercel: import repo, root = `apps/web`, region `fra1`, set env.
4. Point `PDF_RENDERER_URL` at the Railway private URL; set `APP_URL` on `pdf-renderer` to the Vercel URL.
