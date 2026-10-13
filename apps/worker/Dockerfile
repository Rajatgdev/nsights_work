# Railway build for the BullMQ worker (pnpm monorepo).
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc* ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN pnpm install --frozen-lockfile=false --filter @nsights/worker...
RUN pnpm --filter @nsights/worker build

CMD ["pnpm", "--filter", "@nsights/worker", "start"]
