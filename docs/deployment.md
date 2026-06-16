# Deployment

Stack: **Supabase** (Postgres) · **DigitalOcean** (API + workers + managed Redis/Valkey) · **Vercel** (admin frontends). Default region UAE-capable; per-tenant region pinning for residency (see `01-architecture.md` §6.6).

## 1. Database (Supabase)
1. Create a **dedicated** RFM Loyalty Supabase project (not an existing one).
2. Apply the schema in order against the project (via Supabase SQL editor, `psql`, or `pnpm --filter @rfm-loyalty/db db:apply` with `DATABASE_URL`/`DIRECT_URL` set):
   `prisma/sql/0001_baseline.sql` → `rls.sql` → `ledger.sql`.
3. Create the runtime role and give it a password (RLS is enforced for this non-owner role):
   ```sql
   ALTER ROLE loyalty_app WITH LOGIN PASSWORD '<strong-password>';
   ```
4. Connection strings:
   - `DATABASE_URL` / `DIRECT_URL` → the **owner** (`postgres`) for migrations/seed (pooled `6543?pgbouncer=true` and direct `5432`).
   - `APP_DATABASE_URL` → the **`loyalty_app`** role (pooled, transaction mode) — this is what the running app uses, so RLS is enforced.

## 2. API + workers (DigitalOcean)
- `.do/app.yaml` defines an **api** service (2×) and a **jobs** worker (1×) from the root `Dockerfile`.
- Set the secrets in the DO dashboard: `DATABASE_URL`, `DIRECT_URL`, `APP_DATABASE_URL`, `REDIS_URL` (DO managed Valkey), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PII_MASTER_KEY_BASE64` (32 bytes, base64).
- With `REDIS_URL` set, the BullMQ scheduler enables settlement / webhook / point-expiry jobs.
- Build/run locally: `docker build -t rfm-loyalty-api . && docker run -p 3001:3001 --env-file .env rfm-loyalty-api`.

## 3. Frontends (Vercel)
Two Vercel projects, one per app:
- `apps/web-brand` — root directory `apps/web-brand`, framework Next.js, env `NEXT_PUBLIC_API_URL=https://<api-domain>/v1`.
- `apps/web-superadmin` — root directory `apps/web-superadmin`, same env.
(Monorepo: set the project Root Directory; Vercel runs `pnpm install` + `next build` there.)

## 4. CI/CD
`.github/workflows/ci.yml` runs on every PR: install → build → typecheck → lint → apply schema+RLS to an ephemeral Postgres → RLS + rules + API integration tests → OpenAPI diff gate → **HTTP smoke test against the started server**. Wire a deploy step (DO + Vercel) on `main` after CI passes.

## 5. Data residency (multi-country)
Default everything to the UAE-home region. For a merchant with a strict in-country requirement, provision that **group** on a region-local DB and route it by its `home_region` (the app already addresses tenants by id). Supabase/DO have no UAE region today (nearest ≈ Mumbai/Frankfurt); UAE PDPL permits cross-border transfer with safeguards.
