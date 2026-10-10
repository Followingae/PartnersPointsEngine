# 13 — Code Quality & Testing

Audit date: 2026-10-10. Branch `main` @ afc3fe2 plus the uncommitted membership load/spend working tree. Read-only; local test suites were executed against the embedded Postgres each suite boots for itself. No production access, no source edits.

Severity is by risk to correctness and release safety. Confidence: Confirmed (read in code or observed in a run) / Likely / Needs verification.

---

## 0. Summary

| | |
|---|---|
| Suites run locally | 3 of 3 started and passed (shared, db, api). 202 tests, 0 failed, 0 skipped, 0 `.only`/`.todo`. |
| HTTP-level tests | None. Every "e2e" file instantiates services directly with `new`, no Nest app, no guards, no pipes, no filters, no HMAC. The only HTTP coverage is `apps/api/scripts/smoke.mjs` (12 checks, admin login + 8 manage routes). |
| DB role in tests | Owner (`postgres`). RLS is bypassed in the whole API suite and in the ledger/loyalty suites. Only `packages/db/test/rls.test.ts` switches to `loyalty_app`, and it covers 3 tables. |
| Findings | High 5 · Medium 9 · Low 7 · Info 4 (Critical 0) |
| Lint / typecheck | `apps/api` lint: 0 errors, 0 warnings (22s). `apps/mobile` and `apps/web-brand` typecheck: clean. Four of nine workspaces have no lint script at all. |

High findings: CQ-01 no HTTP/guard/auth tests · CQ-02 tenant-isolation assertions in the API suite are vacuous (owner role) · CQ-03 uncommitted schema migration + ledger operations on the auto-deploy branch · CQ-04 `PII_MASTER_KEY_BASE64` unvalidated, silently falls back to a source-derived key · CQ-05 exception filter maps nothing but `HttpException` (Prisma, Ledger, Zod errors become 500s).

---

## 1. Test runs (local, Windows 11, Node 24.16, pnpm 10.29.3)

Command run from repo root with `DATABASE_URL` unset so each suite boots its own embedded Postgres (`packages/db/test/global-setup.ts` port 54329, `apps/api/test/global-setup.ts` port 54330).

| Suite | Files | Tests | Result | Vitest duration | Wall clock |
|---|---|---|---|---|---|
| `pnpm --filter @rfm-loyalty/shared test` | 1 | 11 | pass | 1.60s | 5.9s |
| `pnpm --filter @rfm-loyalty/db test` | 3 | 25 (ledger 17, rls 6, loyalty 2) | pass | 13.94s | 16.4s |
| `pnpm --filter @rfm-loyalty/api test` | 18 | 166 | pass | 42.81s | 46.0s |

No `.skip`, `.only`, `.todo`, or `test.fails` anywhere (`grep` over `apps/api/test`, `packages/*/test`). The Kotlin `CoreLogicTest.kt` (4 tests) was not run: no Gradle step exists in CI and none was requested; it covers E.164 normalisation, ECR order-number length, redemption valuation parity, and SmartPay status parsing.

The `db` suite includes the 7 new load/spend tests from the uncommitted working tree (`packages/db/test/ledger.test.ts:117-236`), so the pass count above already reflects the WIP.

---

## 2. Findings

### CQ-01 — No HTTP-level tests: auth, guards, RBAC, validation pipe, throttling and HMAC are untested
- **Severity:** High · **Confidence:** Confirmed
- **Location:** `apps/api/test/*.e2e.test.ts` (all 17), `apps/api/test/terminal.e2e.test.ts:1-5`, `apps/api/scripts/smoke.mjs`
- **Evidence:** `grep -l "supertest\|createNestApplication\|Test.createTestingModule\|getHttpServer"` over `apps/api/test` returns nothing. The terminal file states it: `"Services are instantiated directly (no Nest DI); the owner connection bypasses RLS"` (`terminal.e2e.test.ts:4-5`). `TerminalService` is built as `new TerminalService(tenants, tokens, loyalty, crypto)` (`:68`) and called with a hand-made `TenantContext` (`:48-56`). `TerminalHmacGuard`, `AdminJwtGuard`, `CustomerJwtGuard`, `WalletJwtGuard`, `PermissionsGuard`, `ValidationPipe`, `AllExceptionsFilter`, `ThrottlerGuard` are imported by no test. `AuthService` (login, MFA, refresh, logout) is imported by no test. The CI smoke script hits `/health`, `POST /v1/auth/login` (good and bad password), and 8 `/v1/manage/*` routes, with one 401 check (`smoke.mjs:24-106`).
- **Impact:** Every security control that lives in a guard, pipe or filter can regress without a red build. Refresh rotation, reuse detection, logout, invite, act-as, permission denials, 400 on bad DTOs, 401 on bad HMAC signature/skew/replay/revoked key, throttling: all untested.
- **Scenario:** A refactor of `TerminalHmacGuard.parseHeader` that accepts an empty `sig` ships green; `smoke.mjs` never signs a terminal request.
- **Fix:** Add a supertest harness that boots `AppModule` against the embedded Postgres (reuse `global-setup.ts`), signs terminal requests with `@rfm-loyalty/sdk-terminal`, and asserts status codes for the matrix in section 3. Start with the 401/403 negatives.
- **Effort:** L

### CQ-02 — API and ledger suites run as the DB owner, so every tenant-isolation assertion in them is vacuous
- **Severity:** High · **Confidence:** Confirmed
- **Location:** `apps/api/test/global-setup.ts:36-51`, `packages/db/test/global-setup.ts:49-64`, `apps/api/test/governance.e2e.test.ts:118-125`, `.github/workflows/ci.yml:23-26`
- **Evidence:** Both setups connect as `postgresql://postgres:postgres@localhost:<port>/postgres` (`apps/api/test/global-setup.ts:50`). `rls.sql:10` says "`loyalty_app` (non-owner) is fully enforced. Runtime always uses loyalty_app" and RLS is `ENABLE`d not `FORCE`d (only `terminal_release` has `FORCE ROW LEVEL SECURITY`, `2026-08-03_terminal_releases.sql:52`), so the owner sees everything. `governance.e2e.test.ts:118` is titled `'RLS isolates change requests across brands'` and asserts `others.total` is 0 for brand B, but the isolation comes from `where: { brandId: ctx.brandId }` in `GovernanceService.listForBrand`, not from RLS. In CI the same suites run against the `postgres` superuser service container (`ci.yml:23-26`). Only `rls.test.ts:76-92` does `SET LOCAL ROLE loyalty_app`.
- **Impact:** A policy regression in `rls.sql` or a missing policy on a new table cannot fail the API suite. `wallet.e2e` "never returns another person's wallet" (`:147`) and `pass-data` "refuses a card belonging to somebody else" (`:73`) hold only because the `wallet_*` SECURITY DEFINER functions filter by argument; they say nothing about RLS.
- **Scenario:** Someone drops a `brandId` filter from a `findMany` in a manage service. Test still passes (owner, single brand fixture); production with `loyalty_app` + brand GUC is still safe, but a platform-scoped caller is not (see CQ-18).
- **Fix:** Have the API harness connect through a `loyalty_app` LOGIN role created by the setup (rls.sql already `GRANT loyalty_app TO current_user`), and rename the governance test or make it `SET ROLE`. Add `FORCE ROW LEVEL SECURITY` consideration to the DB audit.
- **Effort:** M

### CQ-03 — Uncommitted schema migration and ledger operations sit on the branch that auto-deploys
- **Severity:** High · **Confidence:** Confirmed
- **Location:** `git status` (14 modified + 2 untracked), `packages/db/prisma/sql/2026-08-06_membership_load_spend.sql` (untracked), `packages/db/src/migrations.ts:48`, `packages/db/src/ledger/operations.ts:389-660`, `.do/app.yaml:60-63` (`deploy_on_push: true` on `main`)
- **Evidence:** The diff adds `load`/`spend` to `journal_kind` and `terminal_intent` (SQL + Prisma enum + zod enum), two ledger operations (`loadPoints`, `spendPoints`), a new `points_sold` account type, 7 ledger tests, a per-branch report change (`analytics.service.ts:206-230`), activity `branchName` plumbing, and a `dev-db.ts` fix that applies incremental migrations on fresh clusters. Nothing in `apps/api/src` calls `loadPoints` or `spendPoints` (`grep` returns only the enum/report usages). `TransactionDto.intent` is still `@IsEnum(['earn', 'redeem'])` (`terminal-gateway/dto.ts:134`). `analytics.service.ts:206-207` already sums `kind = 'load'`/`'spend'` and the per-branch query was also corrected to count only the liability leg ("the figures here were exactly double", `:197-199`), a bug fix bundled into the WIP.
- **Assessment:** The ledger half is self-contained, idempotent (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`), tested, and the db suite passes with it. It is additive and safe to apply. The feature is half-done: no terminal intent, no controller, no RLS consideration for the new account type, no `receipt`/alert handling for `load`/`spend` journal kinds (txn-alert `groupBySale` is unaware of them), and the expiry sweep will treat `load` credits with `expiryBucket: null` as never expiring (`operations.ts:567`). The reporting bug fix and `dev-db.ts` fix are entangled with the feature.
- **Impact:** Whatever is committed next to `main` deploys to production immediately; a partial commit (e.g. the SQL without `migrations.ts`, or vice versa) would make the boot migrator and the schema disagree. The per-branch report currently in production double-counts (the comment in the diff says so).
- **Fix:** Split into three commits: (1) `dev-db.ts` + `global-setup.ts` harness fixes, (2) per-branch report double-count fix, (3) load/spend ledger + migration behind a feature flag or with the terminal intent wired and tested. Do not land (3) until a caller exists.
- **Effort:** M

### CQ-04 — `PII_MASTER_KEY_BASE64` is not in the env schema and silently degrades to a key derived from a string in source
- **Severity:** High · **Confidence:** Confirmed (code); Needs verification (production env value)
- **Location:** `apps/api/src/auth/crypto/envelope-crypto.service.ts:16-23`, `apps/api/src/config/env.ts` (key absent), `.env.example:PII_MASTER_KEY_BASE64="REPLACE_WITH_BASE64_32_BYTE_KEY"`
- **Evidence:**
  ```ts
  const b64 = config.get<string>('PII_MASTER_KEY_BASE64');
  let key = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
  if (key.length !== 32) {
    this.logger.warn('PII_MASTER_KEY_BASE64 missing/invalid; deriving a DEV key. Do not use in prod.');
    key = createHash('sha256').update('rfm-loyalty-dev-key').digest();
  }
  ```
  `envSchema` validates 15 keys; this one is not among them, so boot does not fail. The `.env.example` placeholder decodes to a non-32-byte buffer and therefore hits the fallback.
- **Impact:** Phone numbers, emails, TOTP secrets and terminal HMAC secrets (`api_key.secret_enc`) would all be encrypted under a key anyone with the repo can compute. A warning line in logs is the only signal.
- **Scenario:** Production env is set from `.env.example` with the placeholder left in, or the var is renamed. API boots, warns once, and every secret written from then on is recoverable from source.
- **Fix:** Add `PII_MASTER_KEY_BASE64: z.string().refine(b => Buffer.from(b,'base64').length === 32)` to `envSchema`, and make the fallback `NODE_ENV !== 'production'` only (throw otherwise). Same treatment for `CORS_ORIGINS` in production.
- **Effort:** S

### CQ-05 — `AllExceptionsFilter` maps only `HttpException`; Prisma, Ledger and Zod errors surface as 500s
- **Severity:** High · **Confidence:** Confirmed
- **Location:** `apps/api/src/platform-core/filters/all-exceptions.filter.ts:37-63`
- **Evidence:** The filter branches on `exception instanceof HttpException` else `instanceof Error` → `status = 500`, `message = NODE_ENV === 'production' ? 'Internal server error' : exception.message`. No reference to `PrismaClientKnownRequestError`, `P2002`, `P2025`, `P2028`, `ZodError`, or `LedgerError` anywhere in `apps/api/src` (grep). Concrete producers:
  - `ledger.LedgerError('idempotency_conflict')` (`packages/db/src/ledger/engine.ts:288`) is only caught for `insufficient_balance` (`terminal.service.ts:728`, `loyalty.service.ts:933`). A till reusing an idempotency key with a different amount gets a 500, not 409.
  - `EarnRule.parse(...)` throws `ZodError` for a malformed stored or submitted definition (`loyalty.service.ts:240,297,342`, `terminal.service.ts:602`) → 500.
  - `TerminalService.transaction` does `findUnique` then `create` on `(actorId, idempotencyKey)` (`terminal.service.ts:641-645`); two concurrent identical requests race to a P2002 unique violation → 500 rather than returning the existing row.
  - `CouponQueryDto.status` is `@IsString()` only (`coupons/dto.ts:98-100`) and is passed as `status: query.status as never` to Prisma (`coupon.service.ts:80`); `?status=bogus` → Prisma enum validation error → 500.
  - Outside production the raw `exception.message` is returned to the client (`:59`), which for Prisma includes the query shape.
- **Impact:** Client-caused conditions return 500s, which pollute error budgets, hide real outages, and (non-prod) leak internals. The terminal app's offline outbox treats 5xx as retryable, so an idempotency conflict is retried forever.
- **Fix:** Map `LedgerError` codes (`insufficient_balance`→400/409, `idempotency_conflict`→409, `invalid_amount`→400), `ZodError`→400 with issues, Prisma `P2002`→409, `P2025`→404, `P2028`/`P1001`→503, in the filter. Add `@IsIn` on every `status`/`channel` query field that is cast `as never` (37 sites).
- **Effort:** S

### CQ-06 — Receipt email runs on the transaction client after the transaction has returned
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/terminal-gateway/terminal.service.ts:401-417` and `:437-455`
- **Evidence:** Inside `this.tenants.run(ctx, async (tx) => { ...; void this.emailReceipt(tx, claims?.membershipId, {...}); return { id: r.id, token: dto.token }; })`. `emailReceipt` awaits `tx.customerMembership.findUnique(...)` (`:445`) and then `this.email.sendReceipt(...)` (`:452`), wrapped in `try { } catch { /* Intentionally silent */ }`. The enclosing callback returns immediately, so Prisma commits and closes `tx` while `emailReceipt` is still pending.
- **Impact:** Either the query runs after commit on a closed interactive transaction (Prisma throws "Transaction already closed", swallowed, email never sent), or it runs before commit and an external email goes out for a receipt that may still roll back. Behaviour depends on scheduling; no test covers it.
- **Fix:** Resolve the address inside the transaction, return it with the result, and send the email after `tenants.run` resolves (or emit to the outbox like alerts do).
- **Effort:** S

### CQ-07 — Partner conversion calls the external connector inside the DB transaction; the compensating void is swallowed
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/partnerships/conversion.service.ts:107-130`
- **Evidence:** Within `tenants.run`: `authorizeRedeem` → `allowanceWallet.update` (row lock) → `conversion.create` → `await this.connector.creditPoints(...)` (external) → `captureRedeem`. On failure: `await ledger.voidRedeem(tx, {...}).catch(() => {})` then refund allowance and mark `failed`. Today the connector is the stub (`partner-connector.ts`), but `connectorMode` `sandbox`/`live` is settable via DTO (`partnerships/dto.ts:7`).
- **Impact:** When an HTTP connector lands, wallet and idempotency rows stay locked for the duration of a partner call; a `voidRedeem` failure leaves the customer's hold in place while the conversion reads `failed` and the allowance is refunded.
- **Fix:** Two-phase: record `pending` and commit; call the partner outside; capture/void in a second transaction with the outbox for retries. Do not swallow the void.
- **Effort:** M

### CQ-08 — Quote and earn evaluate different rule sets; the number shown to the cashier can differ from the number awarded
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `terminal.service.ts:596-605` (quote) vs `loyalty.service.ts:232-258` (earnWithTx)
- **Evidence:** `quote` loads `loyaltyEarnRule` rows and calls `evaluateEarn(rules, { session: {...}, items })`. `earnWithTx` loads the same rows, then `rules.push(...(await this.campaigns.activeRules(tx, ctx)))` (`:251`) and passes `profile: { tier: tier?.name }` (`:256`). The quote has neither campaigns nor the tier, so any campaign bonus or tier-conditioned multiplier is absent from the quote. The rule-assembly block (`EarnRule.parse({ id, name, priority, enabled, channel, condition, actions })`) is copy-pasted at `loyalty.service.ts:240-248`, `:297`, `:342`, `campaign.service.ts:26,55,77`, `terminal.service.ts:602`.
- **Impact:** During a campaign or for tiered members the terminal screen under-quotes; the printed receipt (built from the transaction) then disagrees with what the cashier announced. No test compares quote to transaction.
- **Fix:** Extract `assembleRules(tx, ctx)` + `buildEarnContext(...)` and use it from both paths; add a test asserting `quote.earn.points === transaction.points` under an active campaign.
- **Effort:** S

### CQ-09 — Lint never runs for the three Next consoles or the mobile app; CI "Lint" is green for four of nine workspaces
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `apps/web-brand/package.json`, `apps/web-superadmin/package.json`, `apps/docs/package.json`, `apps/mobile/package.json` (no `lint` script), `apps/*/next.config.mjs` (`eslint: { ignoreDuringBuilds: true }` in all three), `turbo run lint --dry=json`
- **Evidence:** Turbo dry run lists `@rfm-loyalty/web-brand#lint <NONEXISTENT>`, same for `web-superadmin`, `docs`, `mobile`, `config`. There are no eslint config files under `apps/web-*`, `apps/docs`, `apps/mobile` (`ls apps/*/eslint.config.*` finds none). `next build` is told to skip lint. `pnpm lint` therefore lints `api`, `db`, `shared`, `sdk-terminal` only. In those, `@typescript-eslint/no-explicit-any` and `no-unused-vars` are `warn` (`packages/config/eslint/base.mjs:21-25`); eslint exits 0 on warnings so CI cannot fail on them either (today the API has zero warnings). `format:check` exists but is not in CI.
- **Impact:** Console and mobile code (token handling in `localStorage`, deep links, fetch wrappers) has no static analysis at all. React hooks rules, unused imports, and `any` leaks are invisible.
- **Fix:** Add `eslint.config.mjs` (next + react-hooks) to each Next app and Expo's config to mobile, add `lint` scripts, set `ignoreDuringBuilds: false`, promote `no-explicit-any` to error in `base.mjs`, add `--max-warnings 0`, add `format:check` to CI.
- **Effort:** S

### CQ-10 — Runtime configuration is read from 39 distinct keys; the schema validates 15
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `apps/api/src/config/env.ts:4-27`; `process.env.*` reads at `main.ts:29,30,44,67,73`, `app.module.ts:51,64`, `app-status.controller.ts:26-29`, `wallet.service.ts:272`, `receipt-public.controller.ts:141-146`, `terminal.service.ts:424`, `pii-backfill.service.ts:28`, `worker-runner.service.ts:45`, `worker-scheduler.ts:18`, `schema-migrator.ts:132`, `all-exceptions.filter.ts:59`, `auth-prisma.service.ts:24`, `prisma.service.ts:21`
- **Evidence:** `ConfigService.get(...)` is called with 34 distinct keys (grep); the schema has 15. Unvalidated: `PII_MASTER_KEY_BASE64`, `CORS_ORIGINS`, `API_DOCS_ENABLED`, `SKIP_DB`, `SKIP_MIGRATIONS`, `ROLE`, `WORKERS_ENABLED`, `REDIS_URL`, `PUBLIC_API_URL`, `PUBLIC_SITE_URL`, `APP_URL`, `APP_SITE_URL`, `APP_STORE_URL`, `PLAY_STORE_URL`, `APP_MIN_VERSION`, `APP_MAINTENANCE`, `APP_MAINTENANCE_MESSAGE`, `ACCOUNT_DELETION_NOTICE_DAYS`, `EMAIL_FROM`, `RESEND_API_KEY`, `SMS_*` (4), `TWILIO_*` (7), `APPLE_*` (5), `GOOGLE_WALLET_*` (3). Dangerous-by-default behaviours: CORS reflects any origin with credentials when `CORS_ORIGINS` is empty (`main.ts:44-48`, no production guard); Swagger is on unless `NODE_ENV=production` (`main.ts:67`); `JWT_*` minimum is 16 chars (`env.ts:17-18`); `.env.example` ships `LOG_LEVEL="debug"`; `ConfigModule` loads `['../../.env', '.env']` (`app.module.ts:47`) so a stray `.env` in `apps/api` silently overrides the root. Consoles fall back to `http://localhost:3001/v1` when `NEXT_PUBLIC_API_URL` is unset (`apps/web-brand/lib/api.ts:3`), mobile falls back to the production URL (`apps/mobile/lib/api.ts:17`).
- **Impact:** Misconfiguration is discovered at request time, not at boot. The `WORKERS_ENABLED === 'false'` string check and `SKIP_DB === '1'` conventions are easy to get wrong with no error.
- **Fix:** Move every key into `envSchema` with `NODE_ENV`-conditional refinements (e.g. `CORS_ORIGINS` required in production, `PII_MASTER_KEY_BASE64` required, `API_DOCS_ENABLED` boolean). Read only through `ConfigService`.
- **Effort:** M

### CQ-11 — Dead BullMQ scheduler, dead `jobs` worker, and a `ROLE` flag whose only effect is skipping migrations
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/workers/worker-scheduler.ts` (whole file), `workers.module.ts:12`, `worker-runner.service.ts:12-25`, `.do/app.yaml:56-71`, `main.ts:29-37`, `apps/api/package.json` (`bullmq` dependency), `turbo.json` (`REDIS_URL` in `globalEnv`)
- **Evidence:** `WorkerScheduler` enqueues four repeatable jobs when `REDIS_URL` is set and has a `NOTE: the Worker processors ... are registered in a dedicated worker process` that does not exist (grep for `new Worker(` finds nothing). `WorkerRunner`'s own doc comment says so: "`WorkerScheduler` queued repeatable BullMQ jobs, but no processor was ever registered". `.do/app.yaml:66-68` still deploys a `jobs` worker with the comment "a worker entrypoint registers the BullMQ processors" running `node dist/main.js`, so it is a third full API instance (interval loops included, HTTP port bound) that only differs by skipping migrations. Setting `REDIS_URL` in production would add orphaned repeatable jobs to Valkey forever.
- **Impact:** Misleading infra (a paid instance doing duplicate work), a dependency surface (`bullmq`, `ioredis`) with no function, and the risk that someone "enables" Redis expecting it to do something.
- **Fix:** Delete `WorkerScheduler`, the `bullmq` dependency, the `jobs` worker in `app.yaml`, and `ROLE`; or implement the processors and gate `WorkerRunner` on `ROLE`.
- **Effort:** S

### CQ-12 — RLS suite covers 3 tables and 4 scope combinations; nothing covers branch scope, customer actors, definer functions, or tables added after `rls.sql`
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `packages/db/test/rls.test.ts:94-157`, `packages/db/prisma/sql/rls.sql`, `2026-07-28_person_access_and_receipts.sql`, `2026-08-04_push_tokens.sql`, `2026-08-05_account_deletion.sql`, `2026-08-06_pass_registrations.sql`
- **Evidence:** Tests touch `brand`, `customer_membership` (read/write) and set only `app.current_brand_id`, `app.current_group_id`, `app.current_platform_id`. Not tested: branch GUC narrowing (`tenant.service.ts:47-51` sets brand + branch for `scopeLevel: 'branch'` and says "the app-layer guard narrows" but no guard does), `app.current_actor_id`/customer policies on `person`, group principal writing into a brand of another group, platform principal `WITH CHECK`, `ledger_account`/`journal`/`entry`/`account_balance` (RLS via the loop at `rls.sql:103-110` is unverified by tests), the ~50 `SECURITY DEFINER` functions (`wallet_*`, `claim_txn_alerts`, `txn_alert_context`, `terminal_enroll_person`, `ereceipt_*`), and `terminal_release` (`FORCE` policy at `2026-08-03_terminal_releases.sql:51-55`). Tables created after `rls.sql` with no `ENABLE ROW LEVEL SECURITY` statement at all: `receipt`, `push_token`, `account_deletion`, `pass_registration`, `pass_state` (grep over the incremental files finds RLS only for `allowance_topup_request`, `otp_code`, `redemption_config`, `terminal_release`). `loyalty_app` has `SELECT/INSERT/UPDATE/DELETE ON ALL TABLES` plus default privileges (`rls.sql:37-42`), so those five tables are fully readable/writable by any tenant principal. Whether that is intended (person-level tables read through definer functions) is a question for the DB/authz audits; from a testing standpoint there is no test asserting the intent either way.
- **Fix:** Table-driven RLS test: for every table in `pg_tables` assert `rowsecurity = true` or that it is in an explicit allow-list; add branch-scope, customer-actor, and definer-function negative cases.
- **Effort:** M

### CQ-13 — Ledger and terminal state machine lack negative and race tests on key transitions
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `packages/db/test/ledger.test.ts`, `apps/api/test/terminal.e2e.test.ts`, `packages/db/src/ledger/engine.ts:279-305`, `terminal.service.ts:641-645`
- **Evidence:** Tested: earn idempotency, over-authorize rejected, capture, void, concurrent double-spend (`:256`), concurrent spend (`:187`), unbalanced journal trigger, wallet overdraw, global balance invariant, zero/negative load/spend. Not tested anywhere: `idempotency_conflict` (same key, different `requestHash`, `engine.ts:287-289`); capture twice / void after capture / capture of an `earn` (guarded at `terminal.service.ts:749-751` but no test); `adjustPoints` (no caller test; `grep adjustPoints apps/api/test` empty); `reverse`/`fee` kinds (never posted, see CQ-17); huge amounts (bigint overflow at the `BIGINT` column boundary, `Number(c.progress)` precision loss at `terminal.service.ts:586-589`); the `findUnique`→`create` race on `terminalTransaction` (two instances replaying the same offline op concurrently); batch partial failure (the only batch test replays a duplicate and asserts `every(ok)`, `:259-269`); settlement when the group wallet is short (`settlement.service.ts`, only the happy path at `engagement.e2e.test.ts:117`); expiry math is covered by `reporting.e2e:79` and `expiring-points.e2e:202` (good), but only with the sweep's own `current_date`.
- **Fix:** Add the listed negatives to `ledger.test.ts` and `terminal.e2e.test.ts`; add a `Promise.all` replay race for `transaction()`.
- **Effort:** M

### CQ-14 — Refresh-token rotation has no reuse detection and no atomic claim; untested either way
- **Severity:** Low (in this domain; escalate in 02-authz) · **Confidence:** Confirmed (code), Needs verification (intended design)
- **Location:** `apps/api/src/auth/auth.service.ts:87-101`, `:321-326`
- **Evidence:** `refresh()` does `findUnique` → `if (!stored || stored.revokedAt || expired) throw` → `update({ revokedAt })` → issue. A presented token that is already revoked returns 401 but does not revoke its successor (`replacedBy` is written at `:321-326` with `.catch(() => undefined)` and never read). Two concurrent refreshes with the same token both pass the read and both get fresh pairs. No test imports `AuthService`.
- **Fix:** `updateMany({ where: { tokenHash, revokedAt: null } })` and treat `count === 0` as reuse → revoke the family; test both.
- **Effort:** S

### CQ-15 — Documentation claims controls that do not exist
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `docs/security.md:4,8,11,13,17`, `apps/api/src/auth/nonce-store.service.ts:4-6`, `health.controller.ts:28-40`, `docs/03-api-surface.md`, `apps/api/openapi.json`
- **Evidence:** security.md line 4: "RLS on every tenant table" (five tables have none, CQ-12). Line 8: terminal "rotation window" (the guard's own header comment says "which was never built", `terminal-hmac.guard.ts:24-29`). Line 11: `/metrics` (returns `process.memoryUsage()` JSON, not a Prometheus exposition, `health.controller.ts:31-41`; comment says "Production scrapes a Prometheus exporter (prom-client) behind this", no `prom-client` in `package.json`). Line 17 checklist says a Redis nonce store and token-bucket rate limiting have "interfaces exist"; `NonceStoreService` is a `Map` with a comment "in production it is backed by Redis" that is false. `docs/03-api-surface.md` lists 294 `METHOD /path` mentions versus 262 operations on 216 paths in the committed `openapi.json` (CI only checks that the JSON matches the code, not that the prose matches the JSON). README quickstart (`README.md:26-33`) is accurate only with the uncommitted `dev-db.ts` fix; on the committed tree a fresh `pnpm db:dev` seeds against the baseline schema and the seed fails (the diff comment at `dev-db.ts:55-58` says so).
- **Fix:** Correct the four sentences; replace `/metrics` with prom-client or rename it; regenerate 03-api-surface from `openapi.json`.
- **Effort:** S

### CQ-16 — Duplicate and orphaned SQL under `packages/db/migrations/`
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `packages/db/migrations/*.sql` (6 files) vs `packages/db/prisma/sql/` (runtime list in `packages/db/src/migrations.ts`)
- **Evidence:** `2026-07-28_customer_refresh_tokens.sql` and `2026-07-28_otp_code.sql` are byte-identical to the `prisma/sql` copies. `2026-07-28_receipt_vouchers.sql` (`receipt.vouchers`) and `2026-07-28_voucher_reservation.sql` (`voucher.reserved_at`, `reserved` status) are folded into `0001_baseline.sql:278,697`. `2026-07-28_restore_unused_voucher.sql` and `2026-07-28_reward_discount_payload.sql` are one-off data repairs (UPDATE statements) that are in no applied list; whether they ran against production is not recorded anywhere in the repo. `migrations.ts:3-6` explains "there were three [lists] and they drifted".
- **Fix:** Delete the directory; record the two data repairs in `docs/deployment.md` with the date they were run.
- **Effort:** S

### CQ-17 — Dead schema columns, enum values and models
- **Severity:** Low · **Confidence:** Confirmed
- **Location / evidence:**
  - `ApiKey.prevSecretHash` written at `api-key.service.ts:57` on rotation, read nowhere (`terminal-hmac.guard.ts:24-29` documents why a hash cannot verify an HMAC). Writing it suggests a grace period that does not exist.
  - `JournalKind.reverse` and `fee`: no `kind: 'reverse'` / `kind: 'fee'` post anywhere in `apps/api/src` or `packages/db/src`; only the activity label map knows them (`customer-activity.ts:29,110`). The system map's "Reversal / refund" flow has no server path.
  - `ImpersonationSession`: created at `superadmin.service.ts:120`, never queried (no `findMany`/`findFirst`), so act-as sessions cannot be listed, expired or revoked.
  - `PartnerConnectorMode` `sandbox`/`live` accepted by `partnerships/dto.ts:7` and persisted; `partner-connector.ts` is the stub for all modes.
  - `Outbox` is live (terminal, governance, webhook relay) and `LedgerName 'wallet'` is live (`operations.ts:587,617`); not dead.
- **Fix:** Drop `prev_secret_hash` or implement overlap properly; remove or implement `reverse`/`fee`; add a read path or drop `ImpersonationSession`; reject `sandbox`/`live` until a connector exists.
- **Effort:** S

### CQ-18 — 177 `ctx.brandId!` and 50 `ctx.groupId!` assertions; no guard asserts a brand scope on `/manage` routes
- **Severity:** Medium · **Confidence:** Needs verification (depends on whether platform roles carry `brand.*` permissions)
- **Location:** `apps/api/src/modules/**` (grep counts), `auth/guards/*.ts` and `auth/authz/*.ts` (no `scopeLevel`/`brandId` check found by grep), `tenant.service.ts:44-45` (`set(RLS_SETTINGS.brand, ctx.brandId ?? '')`)
- **Evidence:** Services pass `where: { brandId: ctx.brandId! }` (e.g. `loyalty.service.ts:102,235,385,441`). TypeScript's `!` is erased; if a platform-scoped JWT (`brandId: null`) reaches a `/manage` handler, Prisma receives `brandId: undefined`, which it treats as "no filter", and the GUC set is `app.current_platform_id`, which the policies allow across brands. The `PermissionsGuard` is role-only (system map §3). Total non-null assertions in `apps/api/src`: 340 (most are DTO definite-assignment `!:`, benign).
- **Impact:** If any platform role maps to a `brand.*` permission, every brand-scoped list endpoint becomes platform-wide for that caller. If none does today, one line in `ROLE_PERMISSIONS` flips it, and no test would notice (CQ-01, CQ-02).
- **Fix:** A `RequireScope('brand')` guard on the manage controllers that 403s when `req.tenant.brandId` is null; replace `ctx.brandId!` with a `brandCtx(ctx)` helper that throws.
- **Effort:** S

### CQ-19 — Batch replay returns HTTP 200 for any outcome and echoes raw error messages per operation
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `terminal.service.ts:829-840`
- **Evidence:** `catch (e) { results.push({ ok: false, error: e instanceof Error ? e.message : 'error' }) }`. Any Prisma/Ledger/Zod message (including the non-prod query dumps from CQ-05) goes to the terminal; the response is 200 even when all 200 ops failed. The only test (`terminal.e2e.test.ts:259`) asserts `every(ok)`.
- **Fix:** Map per-op errors through the same code table as the filter; add a test with one valid and one `insufficient points` op and assert shape and codes.
- **Effort:** S

### CQ-20 — Interactive transaction defaults (5s timeout, 2s maxWait) are unset; analytics and sweeps run inside `tenants.run`
- **Severity:** Low · **Confidence:** Likely
- **Location:** `platform-core/prisma/prisma.service.ts` (no `transactionOptions`), `tenant.service.ts:18-26`, `analytics.service.ts`, `expiry-sweep.service.ts:17-57` (one transaction per brand sweeping every account)
- **Evidence:** No `transactionOptions`/`maxWait`/`timeout` in either Prisma service (grep). Prisma's default interactive-transaction timeout is 5000 ms. `sweepBrand` posts one journal per expiring account inside a single transaction; on a brand with tens of thousands of members a pass will exceed 5 s, throw `P2028`, roll back everything, and the hourly loop will retry the same oversized unit forever (logged at `worker-runner.service.ts:88` only).
- **Fix:** Set explicit `transactionOptions` per use; batch the sweep by account pages, each its own transaction.
- **Effort:** S

### CQ-21 — Expiry boundary uses the DB session timezone, not the brand's
- **Severity:** Info · **Confidence:** Confirmed
- **Location:** `expiry-sweep.service.ts:24` (`e.expiry_bucket < current_date`), `loyalty.service.ts:170-173` (UTC midnight compare), `0001_baseline.sql:133` (`branch.timezone DEFAULT 'Asia/Dubai'`), `loyalty.service.ts:44` (`BRAND_TZ = 'Asia/Dubai'` hard-coded for happy hours)
- **Evidence:** `expiry_bucket` is a `DATE`; `current_date` on Supabase (UTC) rolls at 04:00 Dubai. The customer-facing `expiring()` compares against UTC midnight too, so the two agree with each other (and `expiring-points.e2e:202` proves that), but both are four hours later than a Dubai business day. `reporting.service.ts:188,204` and `partnership.service.ts:201,243` also use `current_date - N` for daily series.
- **Fix:** Decide the business-day rule once (brand timezone) and apply it in SQL via `(now() AT TIME ZONE b.timezone)::date`.
- **Effort:** S

### CQ-22 — No `.gitattributes`; CRLF/LF drift on Windows, and `format:check` not in CI
- **Severity:** Info · **Confidence:** Confirmed
- **Evidence:** `git diff` prints "LF will be replaced by CRLF" for all 14 modified files; `.prettierrc.json` sets `endOfLine: lf`; `ls .gitattributes` → not found; `ci.yml` has no `format:check` step.
- **Fix:** `* text=auto eol=lf` in `.gitattributes`; add `pnpm format:check` to CI.
- **Effort:** S

### CQ-23 — Terminal Android unit tests are not run in CI
- **Severity:** Info · **Confidence:** Confirmed
- **Evidence:** `ci.yml` has no JDK/Gradle step; `CoreLogicTest.kt` has 4 tests including "redemption valuation mirrors the engine exactly" (`:33`), which is the one test that pins the Kotlin valuation to `redemptionValueMinor` (`loyalty.service.ts:1010-1020`). A server-side change to rounding would not be caught.
- **Fix:** Add a `gradle testDebugUnitTest` job.
- **Effort:** S

### CQ-24 — Determinism: money paths use wall-clock time and `Math.random` with no injection point
- **Severity:** Info · **Confidence:** Confirmed
- **Evidence:** `loyalty.service.ts:276` sets `expiryBucket: new Date(Date.now() + 365d)`; `terminal.service.ts:82,92,108,309,343,532,774` voucher holds against `Date.now()`; `terminal.service.ts:244` generates loyalty IDs from `Date.now()` + `Math.random()`. Tests do not use `vi.useFakeTimers`; `expiring-points.e2e` works around it by writing buckets directly. No snapshot tests exist (good: nothing brittle), and ledger tests assert `available`/`pending` after each op (17 assertions in `ledger.test.ts`, 5 each in `terminal.e2e` and `engagement.e2e`).
- **Fix:** Inject a `Clock`; fake it in tests for hold expiry and expiry-bucket edge cases.
- **Effort:** S

---

## 3. Critical-path test coverage matrix

Status: TESTED (behaviour asserted at the layer that enforces it), PARTIAL (what is missing), UNTESTED. "Service-level" means the test calls the service with a hand-built context; guards, pipes and HTTP status codes are not exercised (CQ-01).

| Flow | Status | Where | Missing |
|---|---|---|---|
| Admin login (password) | PARTIAL | `scripts/smoke.mjs:27-33,105` (HTTP 200 + bad password) | No vitest; lockout, inactive user, no-role user (`auth.service.ts:300`) |
| Admin MFA (enrol, confirm, login step) | UNTESTED | — | `adminMfa`, `enrolMfa`, `confirmMfa` never called by a test |
| Customer OTP issue/verify | TESTED (service) | `otp.e2e.test.ts:48-107` (hash-only storage, single use, 5 wrong guesses, per-number rate limit, re-issue, expiry) | HTTP throttle (5/min, 10/min) |
| Refresh rotation / reuse / logout | UNTESTED | — | See CQ-14 |
| Team invite / role change | UNTESTED | — | `team.service.ts` not imported by any test |
| Superadmin act-as | UNTESTED | — | `actAsBrand`, `elevated` bypass of governance locks |
| Permission denied (403) cases | UNTESTED | — | `PermissionsGuard` never exercised; smoke only checks a 401 |
| Cross-tenant read/write denial | PARTIAL | `rls.test.ts:94-157` (brand/group/platform read, brand WITH CHECK) | Branch scope, customer actor, definer functions, post-`rls.sql` tables, API-layer (CQ-02, CQ-12) |
| Earn idempotency | TESTED | `ledger.test.ts:60`, `terminal.e2e.test.ts:240`, `txn-alerts.e2e:112` | Same key + different payload (`idempotency_conflict`) |
| Authorize / capture / void | TESTED | `ledger.test.ts:69-116`, `terminal.e2e.test.ts:249` | Invalid transitions (capture twice, void after capture, capture an earn) |
| Concurrent double-spend | TESTED | `ledger.test.ts:187,256` | Concurrent replay of the same terminal idempotency key (P2002 race) |
| Negative / zero / huge amounts | PARTIAL | `ledger.test.ts:226` (zero/negative load+spend), DTO `@Min` decorators (not exercised) | Earn with 0 points is covered indirectly (`ledger.test.ts:205`); huge values, `Number()` precision |
| Expiry math | TESTED | `reporting.e2e.test.ts:79`, `expiring-points.e2e.test.ts:105-202` (FIFO, held points, no-bucket points, agreement with sweep) | Timezone boundary (CQ-21); sweep over many accounts (CQ-20) |
| Adjust | UNTESTED | — | `adjustPoints` has no test and no caller test |
| Reverse / refund | UNTESTED (no server path) | — | CQ-17 |
| Settlement | PARTIAL | `engagement.e2e.test.ts:117` (happy path) | Wallet short, cost rule missing, idempotent re-run |
| Group wallet top-up / drawdown insufficient | TESTED | `ledger.test.ts:277,307`, `manage-crud.e2e:118` | — |
| Membership load / spend (WIP) | TESTED (ledger only) | `ledger.test.ts:117-236` | No service/controller exists yet (CQ-03) |
| HMAC: bad sig / skew / replay / revoked key | UNTESTED | — | `TerminalHmacGuard` never instantiated in a test; `HmacService` has no unit test |
| Terminal batch partial failure | PARTIAL | `terminal.e2e.test.ts:259` (dedupe only) | One failing op among successes; error shape (CQ-19) |
| Wallet: join brand | TESTED (service) | `wallet.e2e.test.ts:196-224` | — |
| Wallet: brand token mint for un-joined brand | UNTESTED | — | `POST /customer/wallet/cards/:brandId/token` negative |
| Wallet: sessions revoke | UNTESTED | — | `2026-08-03_wallet_sessions.sql` functions have no test |
| Account deletion sweep | TESTED | `account-deletion.e2e.test.ts:67-126` | — |
| Governance submit/approve/reject/withdraw | TESTED (service) | `governance.e2e.test.ts:63-127` | "RLS isolates" test is app-filter only (CQ-02) |
| Webhooks: signing, retry, DLQ | PARTIAL | `engagement.e2e.test.ts:144` (relay + one signed delivery) | Retry/backoff and `dead` after `MAX_ATTEMPTS = 6` (`webhook.service.ts:9,213-217`) untested |
| Partnerships conversion | UNTESTED | — | `conversion.service.ts` not imported by any test; stub connector |
| Coupons | TESTED (service) | `promotions.e2e.test.ts:68-90` | — |
| Segments | TESTED (service) | `promotions.e2e:96-108`, `segments-demographics.e2e:80-164` | — |
| Campaigns / badges / challenges / referral | TESTED (service) | `engagement.e2e.test.ts:77-107`, `terminal.e2e.test.ts:143` (stamp card) | — |
| Reporting / analytics | TESTED (shape-level) | `reporting.e2e.test.ts:52-101`, `analytics.e2e.test.ts:67-115` | Per-branch double-count fix is uncommitted and untested (CQ-03) |
| Txn alerts | TESTED | `txn-alerts.e2e.test.ts:98-288` (incl. concurrent claim at `:153`) | — |
| PII backfill | TESTED | `pii-backfill.e2e.test.ts` | — |
| Schema migrator | TESTED | `schema-migrator.e2e.test.ts:33-71` (idempotent, concurrent boot) | — |
| Apple/Google pass | TESTED (unit) | `wallet-pass.test.ts` (22) | PassKit web service auth (`passkit-web.controller.ts`) |
| Public receipt page | UNTESTED | — | `receipt-public.controller.ts` (unauthenticated surface) |
| Consoles (web-brand, web-superadmin, docs), mobile | UNTESTED | — | No test files, no lint (CQ-09) |

---

## 4. Inventories

### 4a. TODO / FIXME / HACK (repo-wide, excluding node_modules/dist/.next)

| File:line | Text |
|---|---|
| `apps/api/src/auth/guards/terminal-hmac.guard.ts:78` | `TODO(Phase 8): persist nonces in Redis to reject replays within the skew window.` |
| `apps/mobile/app/all-cards.tsx:45` | `TODO(api): sort + reorder persistence.` |
| `apps/mobile/app/profile/language.tsx:15` | `TODO(api): persist on /customer/me and reload copy.` |
| `apps/mobile/app/profile/partners.tsx:10` | `TODO(api): GET /customer/partners — link state and masked member ref.` |
| `apps/mobile/app/profile/partners.tsx:70` | `TODO(api): DELETE /customer/partners/link` |
| `apps/mobile/components/BrandCard.tsx:351` | `TODO(api): replace with the customer's real cards (GET /me/cards).` |
| `apps/mobile/components/RewardKit.tsx:226` | `TODO(api): server-issued code — replace with the real payload from the API.` |
| `apps/mobile/lib/countries.ts:4` | `TODO: this belongs in packages/shared once the mobile app can import from ...` |

No FIXME/HACK/XXX. The first is the only server-side TODO and is on a security path; five of the mobile ones mean the app still renders placeholder data for cards, rewards and partner links.

### 4b. Type escape hatches in `apps/api/src`

| Pattern | Count | Notes |
|---|---|---|
| `as any` | 0 | rule is `warn`, but clean |
| `@ts-ignore` / `@ts-expect-error` | 0 | |
| `eslint-disable` | 0 | |
| `as unknown as` | 3 | |
| `as never` | 37 | 35 are Prisma enum casts of DTO strings (`status`, `channel`, `roleKey`); safe where the DTO has `@IsIn`, unsafe at `coupon.service.ts:80` (`CouponQueryDto.status` is `@IsString` only), `governance.service.ts:109,145`, `partnership.service.ts:210,289`, `webhook.service.ts:127` (verify each query DTO). 1 is `worker-scheduler.ts:24` (dead). 1 is a comment. |
| Non-null `!` | 340 | 177 `ctx.brandId!`, 50 `ctx.groupId!` (CQ-18); ~70 DTO `field!:` definite-assignment (benign); notable runtime ones: `auth.service.ts:304` `[0]!` after a length check (fine), `terminal-hmac.guard.ts:67` `split('?')[0]!` (fine), `otp-store.service.ts:49`, `deletion.service.ts:46`, `wallet.service.ts:39,243-248` `rows[0]!` on definer-function results (throws `TypeError` → 500 if the function returns no row). |

### 4c. Swallowed catches and floating promises (`apps/api/src`, `packages/db/src`)

| Location | Code | Path | Verdict |
|---|---|---|---|
| `terminal.service.ts:401` | `void this.emailReceipt(tx, ...)` | money (receipt) | Transaction client used after return; swallowed (CQ-06) |
| `terminal.service.ts:449-453` | `catch { /* silent */ }` | receipt email | Hides the "Transaction already closed" from CQ-06 |
| `conversion.service.ts:124` | `voidRedeem(...).catch(() => {})` | money (partner conversion) | Compensation failure swallowed (CQ-07) |
| `wallet.service.ts:243` | `void this.sendWelcome(...).catch(() => undefined)` | email | Acceptable; outside tx; logged nowhere |
| `wallet.service.ts:275` | `catch { }` in `sendWelcome` | email | Acceptable, but no log line |
| `auth.service.ts:108` | `logout` `update(...).catch(() => undefined)` | auth | Acceptable (unknown token → still 200) |
| `auth.service.ts:325` | `replacedBy` write `.catch(() => undefined)` | auth | Chain link silently dropped; feeds CQ-14 |
| `terminal.service.ts:200` | telemetry `updateMany(...).catch(() => undefined)` | app-version | Acceptable |
| `schema-migrator.ts:101,185` | URL parse / advisory unlock | boot | Acceptable |
| `pii-backfill.service.ts:41` | logs and continues | PII | Logged at `error`; acceptable |
| `engine.ts:114` | create race → re-read, rethrow | ledger | Correct |
| `worker-runner.service.ts:82-88` | `.catch(logger.error)` per tick/brand | workers | Correct: `.then(() => undefined)` chains feed into this catch; no unhandled rejections |

---

## 5. Build, lint and typecheck configuration

| Item | Finding |
|---|---|
| `tsconfig.base.json` | `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `skipLibCheck: true`, no `exactOptionalPropertyTypes`. Good baseline. |
| ESLint | Flat config; `@eslint/js` recommended + `typescript-eslint` recommended (not `strict`/`type-checked`); `no-explicit-any` and `no-unused-vars` are `warn`; `consistent-type-imports` off with a justified comment. Applied to `api`, `db`, `shared`, `sdk-terminal` only (CQ-09). |
| Prettier | `.prettierrc.json` present; `format:check` not in CI; no `.gitattributes` (CQ-22). |
| Typecheck in CI | `pnpm typecheck` runs every workspace including `mobile`, `docs`, `web-*` (turbo dry-run confirms); `mobile` and `web-brand` pass locally in 6.3 s / 3.4 s. |
| Next builds | `eslint.ignoreDuringBuilds: true` in all three apps; `typescript.ignoreBuildErrors` not set (good). |
| CI steps | build, typecheck, lint, db:apply, db test, shared test, api test, prod-deps prune check, OpenAPI drift check, HTTP smoke. No format check, no `pnpm audit`, no Kotlin tests, no console/mobile tests. |

---

## 6. Not assessed

- Production environment values (whether `PII_MASTER_KEY_BASE64`, `CORS_ORIGINS`, `APP_DATABASE_URL` are set correctly on DigitalOcean); no production access.
- Whether platform roles carry `brand.*` permissions (`ROLE_PERMISSIONS` in `authz.service.ts`) which decides the severity of CQ-18; left to 02-authz.
- Whether the two one-off data repair scripts in `packages/db/migrations/` were ever run against production.
- Kotlin test execution (no Gradle run performed).
- Load/performance characteristics of `sweepBrand` and analytics transactions (CQ-20 is inferred from defaults, not measured).
- Correctness of the ~50 SECURITY DEFINER SQL functions (DB audit scope).
- Mobile and console runtime behaviour (no tests exist; not exercised here).

## 7. Positive controls verified

- All three suites pass locally with embedded Postgres and the incremental migration list; the API harness and db harness both apply `INCREMENTAL_MIGRATIONS` so tests see the real schema (`apps/api/test/global-setup.ts:26`, `packages/db/test/global-setup.ts:30`).
- `schema-migrator.e2e.test.ts` applies the full list twice and concurrently, enforcing the "safe to run twice" rule stated in `migrations.ts`.
- Ledger invariants have real concurrency tests (`ledger.test.ts:187,256`) and a global balanced-journal check (`:318`); DB trigger rejection is tested (`:236`).
- `txn-alerts.e2e.test.ts:153` proves two relays cannot double-claim via `claim_txn_alerts(...)` `SKIP LOCKED`.
- External senders are stubbed by constructor injection, not env: `CapturingSms` (`otp.e2e.test.ts:40`), `{ sendTemplate: async () => ({ delivered: false }) }` (`txn-alerts.e2e.test.ts:164`), `webhook.fetchImpl` override (`engagement.e2e.test.ts:146`). Nothing leaves the process during tests.
- No `.only`, `.skip`, `.todo`, or snapshot tests; test data is isolated by `randomUUID()` tenants per file; `fileParallelism: false` with `pool: 'forks'` avoids cross-file interference.
- `WorkerRunner` wraps every tick and every per-brand call in `.catch` with logging and a per-job busy guard (`worker-runner.service.ts:73-90`); no unhandled rejection path found.
- `apps/api` lints with zero warnings; `noUncheckedIndexedAccess` is on, which is why the `rows[0]!` sites are explicit rather than silent.
- `AllExceptionsFilter` does suppress stack traces and messages when `NODE_ENV === 'production'` (`:59`), and logs the stack server-side.
- CI verifies the committed `openapi.json` matches the code and that every runtime import survives `pnpm deploy --prod`.
