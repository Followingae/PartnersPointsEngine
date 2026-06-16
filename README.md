# RFM Loyalty Engine

Multi-tenant, **closed-loop**, B2B2C loyalty platform by **RFM Loyalty** (a payments company). One engine, four API surfaces (Superadmin, Brand Admin, Customer SDK, Terminal/POS), powering each onboarded merchant's own brand loyalty program.

> **Plan & architecture:** see [`docs/`](./docs) — start with [`docs/README.md`](./docs/README.md). The plan is approved; this repo is the **Phase 1 — Foundation** build.

## Monorepo layout

```
apps/
  api/             NestJS modular monolith — the engine + all 4 API surfaces
  web-superadmin/  Next.js admin app for the platform operator (RFM Loyalty)
  web-brand/       Next.js admin app for merchants (group/brand/branch staff)
packages/
  db/              Prisma schema, migrations, Row-Level Security (RLS), seed
  shared/          zod DTOs/types, error envelope, conventions (shared by all)
  config/          tsconfig / eslint / prettier / tailwind design-token presets
  sdk-terminal/    (later) typed client for the first-party POS terminal fleet
  sdk-customer/    (later) typed client for the customer mobile/web app
```

## Stack

NestJS + TypeScript · PostgreSQL (shared schema + **RLS**) · BullMQ/Redis + transactional outbox · Prisma · Next.js + Tailwind + shadcn/ui · Turborepo + pnpm. **Auth is fully in-house** (no third-party IdP). Hosting: **Supabase** (Postgres) + **DigitalOcean** (API/workers/Redis) + **Vercel** (frontends).

## Run it locally (no Docker / no Supabase needed)

A persistent **embedded Postgres** is used for local dev (seeded with demo data on first boot).

```bash
pnpm install
pnpm db:dev      # terminal 1 — boots local Postgres on :5432, applies schema + RLS, seeds demo data, then serves
pnpm dev         # terminal 2 — API (:3001), brand app (:3000), superadmin app (:3002)
```

Then open:
- **Brand console** → http://localhost:3000 — `admin@camel-bean.dev` / `ChangeMe123!`
- **Superadmin console** → http://localhost:3002 — `superadmin@rfm-loyalty.dev` / `ChangeMe123!`
- **API docs (Swagger)** → http://localhost:3001/docs

Reset the local DB anytime by deleting `packages/db/.dev-pgdata`. Requires **Node ≥ 22** and **pnpm ≥ 10** (`corepack enable`).

### Production
Point `DATABASE_URL`/`APP_DATABASE_URL` at a real Postgres (Supabase), set `REDIS_URL` (DigitalOcean), and deploy the API/workers to DigitalOcean and the frontends to Vercel. The `loyalty_app` non-owner role enforces RLS in production; migrations run as the owner.

## Conventions (enforced from day one)

- **Tenant isolation:** every tenant table carries its scope key (`brand_id` for loyalty, `group_id` for wallet) and is protected by Postgres RLS **plus** an app-layer scoping guard. Tenant context is set with `SET LOCAL app.current_*` inside a per-request transaction — never session-level `SET`.
- **Money & points are integers** (minor units / whole points). No floats for balances.
- **Idempotency-Key** on every mutating terminal/customer write.
- **Append-only** ledger, outbox, and audit tables (immutable; corrections are reversing entries).
