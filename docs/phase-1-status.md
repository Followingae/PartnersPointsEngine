# Phase 1 — Foundation: Status

> Built and verified locally on 2026-06-13. **No external database was touched.** Everything below is local source + a CI pipeline. Stop point for your review before Phase 2 (Ledger & Wallet core).

## What was built

A deployable, observable, RLS-enforced **walking skeleton** — no business logic yet, but every rail the later phases plug into.

```
rfm-loyalty/                      Turborepo + pnpm monorepo (@rfm-loyalty/*)
├─ apps/
│  └─ api/                        NestJS 11 modular monolith (the engine + 4 surfaces)
│     └─ src/
│        ├─ main.ts               bootstrap: helmet, pino, /v1 prefix, Swagger /docs, error filter
│        ├─ config/env.ts         zod-validated environment (fail-fast)
│        ├─ platform-core/        PrismaService · TenantService (RLS context) · health · ALS · filter
│        ├─ auth/                 in-house auth: password(argon2id) · TOTP · JWT · HMAC · OTP · PDP
│        └─ modules/              8 domain boundary stubs (ledger, wallet, loyalty-rules, …)
├─ packages/
│  ├─ db/                         Prisma schema (19 tables) · RLS SQL · baseline DDL · seed · RLS tests
│  ├─ shared/                     zod DTOs/types, enums, error envelope, scope/RLS settings, money
│  └─ config/                     tsconfig base · eslint presets · Tailwind design-token preset
└─ .github/workflows/ci.yml       install → build → typecheck → lint → apply schema+RLS → RLS tests → OpenAPI gate
```

### Highlights
- **Tenancy hierarchy** `platform → group → brand → branch` in Prisma, with denormalized scope columns so RLS stays flat.
- **Row-Level Security** (`packages/db/prisma/sql/rls.sql`): a dedicated non-owner `loyalty_app` role; hierarchical-but-fail-closed policies (`col = nullif(current_setting(...),'')::uuid`); a brand principal sets only `app.current_brand_id` and can never reach another brand; `USING` + `WITH CHECK` on every policy; append-only trigger on `audit_log`.
- **Transaction-scoped tenant context** (`TenantService.run`) issues `SET LOCAL app.current_*` per request — transaction-pooler safe.
- **In-house auth, all four surfaces:** admin email/password (argon2id) + **TOTP MFA** → scoped access+refresh JWT with rotation; customer phone-OTP → JWT (stub OTP store); terminal API-key + **HMAC** parsing/skew/nonce; a privileged auth DB connection for pre-context credential lookups; PII envelope encryption (AES-256-GCM).
- **Diagnostics that prove isolation:** `GET /v1/admin/diagnostics/visible-brands` counts rows through `TenantService`, so under the enforced role a brand admin sees 1 brand and a superadmin sees all.
- **OpenAPI** auto-generated to `apps/api/openapi.json` (committed + CI-gated). 14 routes across all surfaces.

## Verified locally (✅)
- `pnpm build` — shared, db, api all compile.
- `pnpm typecheck` — 5/5 packages clean.
- `pnpm lint` — clean (0 errors).
- **DI smoke test** — `openapi:gen` boots the entire NestJS module graph; all providers/guards/controllers resolve. (This caught a real DI bug introduced by an over-eager lint autofix — now fixed; `consistent-type-imports` is disabled because it breaks NestJS metadata.)
- Prisma client generates; baseline DDL = **19 tables, 5 enums, 40 indexes, 13 FKs**.

## Validated in CI, not yet against a live DB (⏳)
- **Cross-tenant RLS isolation suite** (`packages/db/test/rls.test.ts`): fail-closed with no context, brand-only visibility, group/platform hierarchy, and `WITH CHECK` blocking cross-brand writes. It runs in GitHub Actions against an **ephemeral Postgres service** (`pnpm --filter @rfm-loyalty/db db:apply` then `test`). It has **not** been run against any hosted database yet (see Supabase note).

## ⚠️ Supabase note
The Supabase MCP currently points at a **pre-existing, unrelated project** (`uxaozlqxiwwaucrfokuk`) and has **no access token** — nothing was ever applied to it (only read-only `get_project_url` + a failed `list_tables`). **Create a dedicated RFM Loyalty Supabase project**, then either put its connection string in `.env` and run `pnpm db:apply` (or migrate), or point the MCP at it with an access token and authorize the apply. I will not apply to any Supabase project without explicit confirmation.

## How to run locally
```bash
pnpm install
cp .env.example .env            # fill DATABASE_URL/DIRECT_URL (new Supabase or local PG), secrets
pnpm db:generate
pnpm --filter @rfm-loyalty/db db:apply   # applies baseline + RLS (fresh DB)
pnpm db:seed                    # demo platform/groups/brands/branches/users
pnpm --filter @rfm-loyalty/db test       # cross-tenant RLS isolation suite
pnpm --filter @rfm-loyalty/api dev       # API at :3001, docs at /docs
```
Seeded admin login (all demo users): password `ChangeMe123!` (e.g. `superadmin@rfm-loyalty.dev`).
For RLS to be enforced at runtime, set `APP_DATABASE_URL` to the `loyalty_app` role (LOGIN + password granted out-of-band).

## Phase 1 exit criteria (vs 05-roadmap.md)
| Criterion | Status |
|---|---|
| Monorepo scaffold (Turborepo + pnpm) | ✅ |
| NestJS modular monolith + clean domain boundaries | ✅ |
| Prisma schema for tenancy hierarchy + scope columns | ✅ |
| RLS enabled/forced policies + non-owner app role | ✅ (live run pending a DB) |
| Transaction-scoped tenant context (`SET LOCAL`) | ✅ |
| In-house auth skeletons (4 surfaces) | ✅ |
| CI: lint/typecheck/build/migrate/OpenAPI + RLS negative suite | ✅ (workflow written) |
| OpenAPI auto-generated | ✅ |
| Baseline observability (structured logging, health/ready) | ✅ |
| Request isolates two seeded brands end-to-end | ⏳ provable via diagnostics/RLS test once a DB is connected |

## Deferred (by design)
- **Admin frontends** → Phase 7 (the Tailwind design-token preset is ready in `packages/config`).
- **Terminal HMAC signature verification + nonce replay cache** → Phase 4 (needs encrypted per-terminal secret storage). Phase 1 authenticates a valid key + skew window only — not production-complete.
- **Real SMS/WhatsApp OTP + Redis store + rate limiting** → Phase 3/5 (current OTP store is an in-memory dev stub).
- **Ledger, wallet, loyalty rules, campaigns, gamification, reporting** → Phases 2–6 (module boundaries exist).

## Suggested next step
**Phase 2 — Ledger & Wallet core**: the double-entry engine (journal/entry/balance), idempotency, no-negative-balance concurrency control, and the hybrid wallet drawdown — with property/concurrency tests. Ideally after you've created the dedicated Supabase project so we can run the RLS suite + migrations against it.
