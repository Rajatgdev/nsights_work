# Railway build for the Playwright PDF renderer.
# Uses the official Playwright image which ships Chromium + all system deps.
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc* ./
COPY tsconfig.base.json ./
COPY apps/pdf-renderer ./apps/pdf-renderer

RUN pnpm install --frozen-lockfile=false --filter @nsights/pdf-renderer...
RUN pnpm --filter @nsights/pdf-renderer build

ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "--filter", "@nsights/pdf-renderer", "start"]
