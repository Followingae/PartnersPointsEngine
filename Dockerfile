# Production image for the RFM Loyalty API (NestJS) — monorepo-aware.
# Build context = repo root:  docker build -t rfm-loyalty-api .
# (Frontends deploy to Vercel; this image serves the API + can run the workers.)

FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ── Build the whole workspace, then carve out a self-contained api deploy ──────
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rfm-loyalty/db db:generate
RUN pnpm build
# pnpm deploy produces a node_modules-complete, hoisted directory for one package.
# --legacy: pnpm v10+ otherwise refuses non-injected workspaces
# (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE).
RUN pnpm --filter @rfm-loyalty/api deploy --prod --legacy /out
# pnpm deploy omits Prisma's *generated* client (.prisma/client) because it's a
# build artifact, not a store package — so the app boots with MODULE_NOT_FOUND.
# Copy the generated client (Linux engine, generated in this build) into /out at
# the matching @prisma/client location.
RUN set -eux; \
    SRC="$(find /app/node_modules/.pnpm -type d -path '*@prisma+client@*/node_modules/.prisma' | head -n1)"; \
    DEST="$(find /out/node_modules/.pnpm -type d -path '*@prisma+client@*/node_modules' | head -n1)"; \
    test -n "$SRC" && test -n "$DEST"; \
    cp -r "$SRC" "$DEST/"

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV API_PORT=3001
COPY --from=build /out /app
EXPOSE 3001
# Healthcheck hits the liveness endpoint.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
