# 09 — Database Audit (Postgres / Prisma / RLS / Ledger / Migrations)

Audit date: 2026-10-10. Branch `main` @ afc3fe2 plus the uncommitted membership-card working tree (`2026-08-06_membership_load_spend.sql`, `operations.ts` load/spend, enum additions). Read-only: no source edits, no commits, nothing applied to any database. The only thing executed was `pnpm --filter @rfm-loyalty/db test` against a throwaway embedded Postgres 17.10 (result: 3 files, 25/25 tests passed, 9.9 s). The local persistent dev cluster was not running, so `prisma migrate diff` against it was not run (see Not assessed).

Scope reviewed: `packages/db/prisma/schema.prisma` (57 models), `prisma/sql/0001_baseline.sql`, `ledger.sql`, `rls.sql`, all 28 dated migrations, the legacy `packages/db/migrations/` folder, `packages/db/src/migrations.ts`, `apps/api/src/platform-core/prisma/schema-migrator.ts`, `prisma.service.ts`, `tenancy/tenant.service.ts`, `config/env.ts`, `main.ts`, `packages/db/src/ledger/{engine,operations}.ts`, `packages/db/scripts/*`, `packages/db/test/*`, `apps/api/test/{global-setup,schema-migrator.e2e}.ts`, every `$queryRaw/$executeRaw/$transaction` call site in `apps/api/src` (75 sites), the workers (`worker-runner`, `expiry-sweep`, `settlement`, `txn-alert`, `webhook`, `pii-backfill`, `deletion`), `terminal.service.ts`, `coupon.service.ts`, `superadmin.service.ts`, `.do/app.yaml`, `.env.example`, `Dockerfile`, `.github/workflows/ci.yml`, `docs/deployment.md`, `docs/security.md`.

Severity counts: Critical 0 · High 3 · Medium 11 · Low 10 · Info 2.

---

## 1. Findings

### DB-01 — Background workers enumerate tenants with no tenant context; under the RLS role they see nothing, so settlement, point expiry and webhook relay never run
- **Severity:** High · **CVSS:** n/a (not externally exploitable; financial/operational integrity) · **Confidence:** Likely (code-confirmed; runtime effect depends on `APP_DATABASE_URL` being set, which `.do/app.yaml:28` and `.do/app.yaml:73` declare for both the `api` service and the `jobs` worker)
- **Location:** `apps/api/src/modules/workers/worker-runner.service.ts:91-115`; `packages/db/prisma/sql/rls.sql:238-250` (brand policy), `:225-235` (tenant_group policy); `apps/api/src/platform-core/prisma/prisma.service.ts:16`
- **Evidence:**
  ```ts
  // worker-runner.service.ts:92 — plain client, no TenantService.run, no set_config
  const brands = await this.prisma.brand.findMany({ where: { status: 'active' }, select: { id: true, groupId: true, platformId: true } });
  // :106
  const groups = await this.prisma.group.findMany({ where: { status: 'active' }, select: { id: true, platformId: true } });
  ```
  ```sql
  -- rls.sql:240 — brand is visible only when one of the three GUCs matches
  CREATE POLICY tenant_isolation ON public.brand FOR ALL TO loyalty_app
  USING ( id = nullif(current_setting('app.current_brand_id', true), '')
       OR group_id = nullif(current_setting('app.current_group_id', true), '')
       OR platform_id = nullif(current_setting('app.current_platform_id', true), '') )
  ```
  With no GUC set every clause is NULL, so `loyalty_app` gets zero rows: `perBrand` and `perGroup` iterate an empty list and the jobs they wrap (`settlement` 60 s, `point-expiry` 3600 s, `webhooks` 30 s) do nothing, silently and forever. The authors hit exactly this for the alert relay and documented it in `2026-08-03_claim_txn_alerts.sql:1-9` ("With the GUCs unset the policy filtered every row out and the relay quietly did nothing ... rows sitting unpublished with attempts = 0") and fixed only that path with a SECURITY DEFINER function. `txn-alerts` and `account-deletions` therefore work; the three tenant-iterating jobs do not. `rls.test.ts:99-102` proves the fail-closed behaviour that causes this. No e2e test exercises `WorkerRunner` (it is disabled when `NODE_ENV=test`, `worker-runner.service.ts:45`) and every e2e test runs as the superuser (`apps/api/test/global-setup.ts:41-52`), so the condition is invisible in CI.
- **Impact:** Group wallets are never drawn down for captured redemptions (platform revenue not collected, `terminal_transaction.settled_at` stays NULL); points never expire (liability overstated, breakage never recognised); merchant webhooks never fire. If the operator "fixes" it by removing `APP_DATABASE_URL`, the API silently falls back to the owner connection and RLS is bypassed for every request (see DB-08).
- **Failure scenario:** Deploy with `APP_DATABASE_URL` → `SELECT ... FROM brand WHERE status='active'` returns 0 rows under `loyalty_app` → no settlement ever → `SELECT count(*) FROM terminal_transaction WHERE state='captured' AND settled_at IS NULL` grows monotonically.
- **Fix (S):** Enumerate tenants through a definer function, matching the established pattern:
  ```sql
  CREATE OR REPLACE FUNCTION public.worker_active_brands()
  RETURNS TABLE (id text, group_id text, platform_id text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT id, group_id, platform_id FROM brand WHERE status = 'active'
  $$;
  CREATE OR REPLACE FUNCTION public.worker_active_groups()
  RETURNS TABLE (id text, platform_id text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT id, platform_id FROM tenant_group WHERE status = 'active'
  $$;
  REVOKE ALL ON FUNCTION public.worker_active_brands() FROM public;
  REVOKE ALL ON FUNCTION public.worker_active_groups() FROM public;
  GRANT EXECUTE ON FUNCTION public.worker_active_brands() TO loyalty_app;
  GRANT EXECUTE ON FUNCTION public.worker_active_groups() TO loyalty_app;
  ```
  and add an e2e test that boots the runner against a `loyalty_app` connection and asserts `settled_at` gets set. Also add a `/metrics` gauge for unsettled captured transactions and for the age of the oldest unpublished outbox row so this class of silent stall pages someone.

### DB-02 — Concurrent capture + void of the same authorized redemption drives `pending_debits` negative and inflates the member's available balance
- **Severity:** High · **CVSS 3.1:** 5.3 (AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:H/A:N) · **Confidence:** Confirmed (by code; not reproduced)
- **Location:** `apps/api/src/modules/terminal-gateway/terminal.service.ts:745-818`; `packages/db/src/ledger/engine.ts:159-166` (`releasePending`), `:247-257` (`captureHold`); `packages/db/prisma/sql/ledger.sql:66-70`
- **Evidence:** Both transitions are read-then-write with no row lock and an unconditional update:
  ```ts
  // terminal.service.ts:747-762 (capture)
  const t = await tx.terminalTransaction.findFirst({ where: { id: txnId, brandId: ctx.brandId! } });
  if (t.intent !== 'redeem' || t.state !== 'authorized' ...) throw ...
  const cap = await ledger.captureRedeem(tx, {... idem: { key: `term:${t.idempotencyKey}:cap` } });
  const updated = await tx.terminalTransaction.update({ where: { id: t.id }, data: { state: 'captured', ... } });
  // terminal.service.ts:798-809 (void) — same shape, key `...:void`
  await ledger.voidRedeem(tx, ...);   // → releasePending
  const updated = await tx.terminalTransaction.update({ where: { id: t.id }, data: { state: 'voided' } });
  ```
  ```ts
  // engine.ts:159 — unguarded
  UPDATE account_balance SET pending_debits = pending_debits - ${amount}::bigint ... WHERE account_id = ${accountId}
  ```
  ```sql
  -- ledger.sql:66 — only the net is constrained; pending_debits may go negative
  CHECK ( normal_side <> 'credit' OR (posted_credits - posted_debits - pending_debits) >= 0 )
  ```
  Under READ COMMITTED, two transactions (capture and void, different idempotency keys `:cap` / `:void`) both read `state = 'authorized'`. Capture runs first: `captureHold` (guarded on `pending_debits >= amount`) moves `p` from pending to posted and credits revenue. Void then runs `releasePending`: `pending_debits = 0 - p = -p`. The CHECK passes (`credits - debits - (-p)` is larger, not smaller). Available balance is now `credits - debits + p`: the member received the discount and keeps the points. Whichever `update` runs last sets the row's final state. `lock_version` is incremented on every update but never compared (`schema.prisma:943`, no caller reads it).
- **Impact:** Points inflation per redemption; the drawdown settlement still charges the group wallet for the capture. Exploitable by anyone holding a terminal HMAC key (merchant staff, a compromised terminal, or the terminal app's own retry/timeout logic racing a capture against a void).
- **Fix (S):** Make the state transition the lock, and constrain pending at the DB:
  ```ts
  // capture: atomic claim first; if 0 rows, re-read and return the current state (idempotent)
  const n = await tx.terminalTransaction.updateMany({
    where: { id: txnId, brandId: ctx.brandId!, intent: 'redeem', state: 'authorized' },
    data: { state: 'captured' } });
  if (n.count === 0) { /* fetch and return mapTxn(current) or 409 */ }
  // same for void: where state: 'authorized' → 'voided'
  ```
  ```sql
  ALTER TABLE public.account_balance
    ADD CONSTRAINT account_balance_pending_non_negative CHECK (pending_debits >= 0 AND pending_credits >= 0);
  ```
  and change `releasePending` to a guarded update (`... AND pending_debits >= ${amount}`) that throws `LedgerError('no matching hold')` on 0 rows.

### DB-03 — `terminal_release` RLS policy reads the wrong GUC name (`app.current_platform` vs `app.current_platform_id`) and is FORCE'd, so the superadmin release console cannot list, create or publish releases under the runtime role
- **Severity:** High · **CVSS:** n/a (availability of an internal control-plane feature; also an RLS-correctness defect) · **Confidence:** Confirmed
- **Location:** `packages/db/prisma/sql/2026-08-03_terminal_releases.sql:51-57`; `packages/shared/src/scope.ts:44-51`; `apps/api/src/platform-core/tenancy/tenant.service.ts:36-37`; `apps/api/src/modules/superadmin/superadmin.service.ts:1243-1345`
- **Evidence:**
  ```sql
  ALTER TABLE terminal_release ENABLE ROW LEVEL SECURITY;
  ALTER TABLE terminal_release FORCE ROW LEVEL SECURITY;
  CREATE POLICY terminal_release_platform ON terminal_release
    USING (platform_id = current_setting('app.current_platform', true))
    WITH CHECK (platform_id = current_setting('app.current_platform', true));
  ```
  ```ts
  // scope.ts:45 — what the app actually sets
  platform: 'app.current_platform_id',
  ```
  `current_setting('app.current_platform', true)` is never set by `TenantService.applyContext`, so it is NULL (or `''` if the `ALTER ROLE ... SET` defaults in `rls.sql:136-149` were accepted). `tx.terminalRelease.findMany` (`superadmin.service.ts:1246`) returns `[]`; `tx.terminalRelease.create` (`:1304`) fails with `new row violates row-level security policy`. Because the policy is `FORCE`d and not restricted `TO loyalty_app`, even the table owner is subject to it unless the connecting role has `BYPASSRLS`/superuser — which is why CI (superuser `postgres`) and the local embedded cluster never notice. Terminals are unaffected: `terminal_current_release()` is SECURITY DEFINER (`:63-79`) and `terminal.service.ts:203-205` uses it.
- **Impact:** OTA terminal releases cannot be registered or published from the superadmin console in any environment that uses `loyalty_app`. The obvious operator workaround (grant `BYPASSRLS` to `loyalty_app`, or point the API at the owner URL) disables tenant isolation platform-wide.
- **Fix (S):**
  ```sql
  DROP POLICY IF EXISTS terminal_release_platform ON public.terminal_release;
  CREATE POLICY terminal_release_platform ON public.terminal_release FOR ALL TO loyalty_app
    USING (platform_id = nullif(current_setting('app.current_platform_id', true), ''))
    WITH CHECK (platform_id = nullif(current_setting('app.current_platform_id', true), ''));
  ```
  Ship as a new file (`2026-10-xx_fix_terminal_release_policy.sql`); do not edit the applied one. Add a test that creates a release through `SuperadminService` on a `SET ROLE loyalty_app` connection.

### DB-04 — No index on `ledger_account(customer_id)`: every balance read, earn, quote, wallet card and pass build scans the brand's account set
- **Severity:** Medium (becomes High at ~50k+ members per brand) · **Confidence:** Confirmed
- **Location:** `packages/db/prisma/schema.prisma:880-882`; `packages/db/prisma/sql/ledger.sql:73-76`; `packages/db/src/ledger/engine.ts:74-85`; `apps/api/src/modules/loyalty-rules/loyalty.service.ts:81-91`; `2026-07-28_customer_wallet.sql:38-46`; `2026-08-06_wallet_pass_data.sql:40-45`
- **Evidence:** Indexes on `ledger_account` are `(brand_id)`, `(group_id)`, `(ledger, account_type)` and the unique `(ledger, account_type, asset_code, group_id, coalesce(brand_id,''), coalesce(customer_id,''))`. None leads with `customer_id`, and the application predicates use plain `customer_id = $1` (not the `coalesce` expression), so the unique index can serve at most its first four columns, i.e. "all `points_liability` accounts of this brand". Hot queries that filter by customer:
  ```ts
  // engine.ts:75 (every earn/redeem/load/spend)
  tx.ledgerAccount.findFirst({ where: { ledger, accountType, assetCode, groupId, brandId, customerId } })
  // loyalty.service.ts:81 (balance, history, expiring, quote)
  tx.ledgerAccount.findFirst({ where: { ledger:'points', accountType: POINTS_LIABILITY, brandId, customerId: membershipId, assetCode } })
  ```
  ```sql
  -- wallet_cards (one LATERAL per card), wallet_pass_data
  FROM ledger_account la JOIN account_balance ab ON ab.account_id = la.id
  WHERE la.account_type = 'points_liability' AND la.customer_id = cm.id LIMIT 1
  ```
  Each is an index range scan over N member accounts (N = members of the brand) followed by a heap filter, per request.
- **Impact:** Per-request DB cost grows linearly with brand size on the hottest path (POS earn/quote). At 100k members a single balance read touches ~100k index tuples.
- **Fix (S):**
  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS ledger_account_customer_idx
    ON public.ledger_account (customer_id, account_type) WHERE customer_id IS NOT NULL;
  ```
  (Run outside the boot migrator or accept that `CONCURRENTLY` cannot run inside the migrator's `BEGIN`; the table is small enough today that a plain `CREATE INDEX` at boot is acceptable, but note it takes a SHARE lock blocking writes for the duration.)

### DB-05 — Point-expiry sweep does a whole-brand aggregate over every `entry` row and posts all breakage journals inside ONE interactive transaction with Prisma's default 5-second timeout
- **Severity:** Medium (High once it starts failing, because it then fails every hour forever) · **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/workers/expiry-sweep.service.ts:17-58`; `apps/api/src/platform-core/tenancy/tenant.service.ts:22` (no `timeout`/`maxWait` options)
- **Evidence:**
  ```ts
  return this.tenants.run(ctx, async (tx) => {               // one $transaction for the whole brand
    const rows = await tx.$queryRaw`
      SELECT la.id, coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='credit' AND e.expiry_bucket IS NOT NULL AND e.expiry_bucket < current_date),0)::bigint AS earned_expired, ab.posted_credits, ab.posted_debits, ab.pending_debits
        FROM ledger_account la JOIN account_balance ab ON ab.account_id = la.id
        LEFT JOIN entry e ON e.account_id = la.id
       WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
       GROUP BY la.id, ...`;                                   // scans ALL entries of ALL members, hourly
    for (const r of rows) { ... await ledger.getOrCreateAccount(...); await ledger.postJournal(...) }  // ≥5 round trips per account
  ```
  There is no index that lets the planner skip non-credit / non-expiring entries (`entry` has `(account_id)`, `(journal_id)`, `(brand_id)` only), and the LEFT JOIN pulls every entry regardless. Prisma 6.19 interactive transactions default to `timeout: 5000 ms`, `maxWait: 2000 ms`; nothing overrides them. The whole result set is also held in Node memory.
- **Impact / failure scenario:** Brand with 2M entries: aggregate ≈ 1-3 s; a month-end where 2,000 accounts cross a bucket needs ≥10,000 statements ≈ 10-20 s through Supavisor → `P2028 Transaction already closed` → full rollback → every hourly run repeats the same work and fails identically; expiry never lands. Cost is O(total entries of brand) per hour regardless of whether anything expires.
- **Fix (M):** (1) Split: one short transaction to compute candidates, then one transaction per account (as `SettlementService.settleOne` already does). (2) Restrict the aggregate to what can expire and give it an index:
  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS entry_expiring_credit_idx
    ON public.entry (account_id, expiry_bucket) WHERE direction = 'credit' AND expiry_bucket IS NOT NULL;
  ```
  (3) Pass `{ timeout: 30_000, maxWait: 5_000 }` to `$transaction` for worker contexts. (4) Longer term, a lot table (or a materialised per-account `expired_credits` counter maintained on insert) removes the full scan.

### DB-06 — Settlement poll lacks a usable index; it sequentially scans `terminal_transaction` every 60 s per group
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/workers/settlement.service.ts:20-28`; `schema.prisma:1133-1136`
- **Evidence:** `where: { groupId, intent: 'redeem', state: 'captured', settledAt: null }, take: 200`. Indexes on the table: `(brand_id)`, `(membership_id)`, unique `(actor_id, idempotency_key)`. No index contains `group_id`, `state` or `settled_at`.
- **Impact:** One full table scan per group per minute, forever, on the table that records every POS sale (earns included). Also the RLS predicate for group-scoped principals (`group_id = ...`) has no index on this table.
- **Fix (S):**
  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS terminal_transaction_unsettled_idx
    ON public.terminal_transaction (group_id, created_at)
    WHERE intent = 'redeem' AND state = 'captured' AND settled_at IS NULL;
  ```

### DB-07 — Transaction and pool limits are left at Prisma defaults; every request pins a pooled connection for its full duration; no `statement_timeout` / `idle_in_transaction_session_timeout`
- **Severity:** Medium · **Confidence:** Confirmed (defaults); pooler-side limits Not assessed
- **Location:** `tenant.service.ts:22`; `prisma.service.ts:16-18`; `.env.example:7,11`; `.do/app.yaml:17-18` (basic-xs, 2 instances)
- **Evidence:** `this.prisma.$transaction(async (tx) => ...)` with no options → `maxWait` 2 s, `timeout` 5 s. `datasourceUrl` carries only `?pgbouncer=true` (example); no `connection_limit`, `pool_timeout`, `statement_timeout`, or `options=-c idle_in_transaction_session_timeout=`. Prisma's default pool is `num_cpus*2+1` = 3 connections on a 1-vCPU `basic-xs`. Every API call, including read-only GETs, runs inside `TenantService.run` (an interactive transaction), so the API's effective concurrency is 3 in-flight requests per instance (6 total); the 7th waits ≤2 s then fails with `P2028 Unable to start a transaction in the given time`. Heavy analytics queries (`analytics.service.ts:19-240`, `reporting.service.ts`, `segment.service.ts:190-200` CTE over all members) run inside the same 5 s window.
- **Impact:** Under POS peak the API returns 500s on otherwise healthy requests; long reports time out; a stuck client holds a Supavisor slot with no server-side cap.
- **Fix (S):** Set `connection_limit=10&pool_timeout=10` (sized against the Supavisor pool), pass `{ maxWait: 5_000, timeout: 15_000 }` by default and larger values for workers/reports, set `ALTER ROLE loyalty_app SET statement_timeout = '15s'` and `SET idle_in_transaction_session_timeout = '30s'` (Supabase permits `ALTER ROLE ... SET` for these standard GUCs; `rls.sql:144` already attempts role-level settings).

### DB-08 — RLS enforcement is never asserted: `APP_DATABASE_URL` is optional, the owner is the silent fallback, and 100% of API e2e tests run as superuser
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `apps/api/src/config/env.ts:12-14`; `prisma.service.ts:16`; `apps/api/test/global-setup.ts:41-52`; `.github/workflows/ci.yml:17-33`; `rls.sql:86-87` (ENABLE not FORCE)
- **Evidence:** `APP_DATABASE_URL: z.string().optional()`; `const url = config.get('APP_DATABASE_URL') ?? config.get('DATABASE_URL')`. There is no boot check of `current_user`, `pg_roles.rolbypassrls`, `rolsuper`, or table ownership. RLS is `ENABLE`d, so the owner bypasses it by design. All e2e tests connect as `postgres` (superuser locally; CI's `postgres:16` service user is superuser) — only `packages/db/test/rls.test.ts:86-97` ever executes `SET LOCAL ROLE loyalty_app`, and it covers four queries on two tables. DB-01 and DB-03 are direct consequences of this blind spot.
- **Impact:** Any environment that forgets `APP_DATABASE_URL` (a new DO app, a preview, a hot-fix) runs with tenant isolation off and nothing notices; RLS regressions ship green.
- **Fix (S/M):** At boot, run `SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user` and `SELECT pg_has_role(current_user, c.relowner, 'MEMBER') FROM pg_class c WHERE c.relname='brand'`; refuse to start in `NODE_ENV=production` unless non-super, non-bypass, non-owner. Make `APP_DATABASE_URL` required when `NODE_ENV=production`. In the e2e harness, create a `loyalty_app` LOGIN role in the embedded cluster and point the Nest `PrismaService` at it (owner stays for fixtures).

### DB-09 — Authorized redemption holds never expire; abandoned holds lock customer points indefinitely
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `terminal.service.ts:717-742` (creates `state: 'authorized'` + `holdPending`); no code anywhere sets `state: 'expired'` (`grep -rn "state: 'expired'" apps/api/src` → none); `docs/04-feature-list.md:58` claims "Held points auto-release on TTL"
- **Evidence:** Vouchers have `VOUCHER_HOLD_MS` + `releaseStaleHolds` (`terminal.service.ts:80-99`); point holds have nothing equivalent. `pending_debits` only decreases through `captureHold`/`releasePending`, both of which require the terminal to call capture/void.
- **Impact:** Till crash / network loss between authorize and capture → the member's balance is reduced for ever; liability reports (`posted − pending`) understate what the brand owes; support has no tool to release.
- **Fix (M):** Add `expires_at` to `terminal_transaction` (or derive from `created_at + interval`), a worker that selects `state='authorized' AND created_at < now() - interval '36 hours' ... FOR UPDATE SKIP LOCKED`, calls `voidRedeem` with idem key `term:<key>:expire`, and sets `state='expired'`. Add the partial index `(brand_id, created_at) WHERE state='authorized'`.

### DB-10 — Counter-style limits are read-check-increment with no DB guard: coupon `max_redemptions` / `per_customer_limit`, partner allowance `balance_minor`
- **Severity:** Medium · **CVSS 3.1:** 3.1 (AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N) · **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/coupons/coupon.service.ts:143-157`; `apps/api/src/modules/partnerships/conversion.service.ts:104-111`; `schema.prisma:805-819` (no unique on `(coupon_id, membership_id)`), `:1414-1429` (no CHECK on `balance_minor`)
- **Evidence:**
  ```ts
  if (coupon.redeemedCount >= coupon.maxRedemptions) return { valid:false, reason:'exhausted' };
  const used = await tx.couponRedemption.count({ where: { couponId, membershipId } });
  if (used >= coupon.perCustomerLimit) return ...;
  ...
  await tx.coupon.update({ where: { id: c.id }, data: { redeemedCount: { increment: 1 } } });   // unconditional
  await tx.couponRedemption.create({...});
  ```
  ```ts
  if (!wallet || wallet.balanceMinor < costMinor) throw ...;
  await tx.allowanceWallet.update({ where: { id: wallet.id }, data: { balanceMinor: { decrement: costMinor } } });  // unconditional
  ```
  Two concurrent redeems of a 1-use code both pass the check, both increment; `coupon_redemption` has no unique constraint to catch it. Two concurrent conversions both pass the allowance check and drive `balance_minor` negative. Contrast with the ledger engine, which does this correctly (`engine.ts:128-135` conditional UPDATE).
- **Impact:** Over-redemption of promo codes (merchant loss); partner allowance overspend (platform loss).
- **Fix (S):**
  ```sql
  ALTER TABLE public.coupon ADD CONSTRAINT coupon_redeemed_within_max CHECK (redeemed_count <= max_redemptions);
  ALTER TABLE public.allowance_wallet ADD CONSTRAINT allowance_wallet_non_negative CHECK (balance_minor >= 0);
  -- per-customer single-use (only when per_customer_limit = 1; otherwise count under FOR UPDATE on the coupon row)
  CREATE UNIQUE INDEX CONCURRENTLY coupon_redemption_single_use_uq ON public.coupon_redemption (coupon_id, membership_id) WHERE membership_id IS NOT NULL;
  ```
  and switch to `UPDATE coupon SET redeemed_count = redeemed_count + 1 WHERE id = $1 AND redeemed_count < max_redemptions` / `UPDATE allowance_wallet SET balance_minor = balance_minor - $2 WHERE id = $1 AND balance_minor >= $2`, checking the row count.

### DB-11 — Account "deletion" keeps `phone_hash`/`email_hash`, leaves refresh tokens valid, and the archived person can sign back in by OTP and re-activate archived memberships with their old balance
- **Severity:** Medium (privacy/compliance; also a correctness gap in the app-store-mandated flow) · **Confidence:** Confirmed
- **Location:** `packages/db/prisma/sql/2026-08-05_account_deletion.sql:90-128`; `2026-07-28_customer_wallet.sql:182-199` (`wallet_person_by_phone` has no status filter); `2026-07-28_wallet_join_brand.sql:36-43` (re-join flips any non-active membership back to `active`); `apps/api/src/auth/auth.service.ts:145-148`
- **Evidence:**
  ```sql
  UPDATE person SET full_name = NULL, phone_enc = NULL, email_enc = NULL, birthdate = NULL, nationality = NULL, status = 'archived' WHERE id = r.person_id;
  DELETE FROM push_token WHERE push_token.person_id = r.person_id;
  UPDATE customer_membership SET status = 'archived' WHERE customer_membership.person_id = r.person_id;
  ```
  `phone_hash`, `email_hash`, `gender`, `home_branch_id` and every `refresh_token` row survive. `phone_hash = sha256(E.164)` is a lookup key, not an anonymiser: the E.164 space is small enough to brute-force, and `terminal_enroll_person` (`rls.sql:354`) and `wallet_person_by_phone` continue to resolve it. `wallet_person_by_phone` does not check `p.status`, so an OTP to the "deleted" number issues a fresh wallet session; `wallet_join_brand` then does `IF existing.status <> 'active' THEN UPDATE customer_membership SET status = 'active'`, and the ledger account (keyed by `customer_id = membership.id`) still holds the balance. The sweep's own comment ("no session to refresh") is not implemented: no `UPDATE refresh_token SET revoked_at = now() WHERE person_id = ...`.
- **Impact:** A deletion a regulator or app-store reviewer would consider incomplete (identifier hashes retained, sessions live for up to 30 days, trivially reversible); a till can silently re-enrol a "deleted" customer onto the same `person` row by phone.
- **Fix (S):** In `sweep_account_deletions`, also `SET phone_hash = NULL, email_hash = NULL, gender = NULL, home_branch_id = NULL`, `UPDATE refresh_token SET revoked_at = now() WHERE person_id = r.person_id AND revoked_at IS NULL`, `DELETE FROM pass_registration WHERE serial_number IN (SELECT id FROM customer_membership WHERE person_id = r.person_id)`; make `wallet_person_by_phone` and `wallet_join_brand` refuse `status = 'archived'`; decide explicitly whether archived memberships may be revived (and if so, whether the balance should have been expired/voided at deletion as the file's own comment implies).

### DB-12 — Migration source-of-truth is split: a legacy folder nobody applies, a regenerated baseline, a Prisma datamodel that is already out of sync with SQL, a `db:migrate` script with no migrations directory, and a `db:apply` that does not record what it ran
- **Severity:** Medium · **Confidence:** Confirmed (repo); production state Needs verification
- **Location:** `packages/db/migrations/*.sql` (6 files, last commit 565e824); `packages/db/prisma/sql/0001_baseline.sql` (mtime Jul 28 14:45, same minute as `migrations/2026-07-28_receipt_vouchers.sql`); `packages/db/package.json:23-24`; `packages/db/scripts/apply-sql.ts:33-36`; `schema-migrator.ts:159-181`
- **Evidence:**
  - `migrations/2026-07-28_customer_refresh_tokens.sql` and `_otp_code.sql` are byte-identical to their `prisma/sql` twins (diffed). The other four exist **only** in the legacy folder and are referenced by no script: `voucher_reservation.sql` (`ALTER TYPE voucher_status ADD VALUE 'reserved'`, `reserved_at timestamptz`, **partial index `voucher_reserved_at_idx`**), `restore_unused_voucher.sql` and `reward_discount_payload.sql` (data repairs), `receipt_vouchers.sql`. The baseline was regenerated to include the column (`0001_baseline.sql:697 "reserved_at" TIMESTAMP(3)`) but **not** the index (absent from the 118 `CREATE INDEX` lines) and with a different type (`timestamp(3)` vs `timestamptz`). Whether production has the index or the two data fixes depends on what was pasted into the Supabase SQL editor on 2026-07-28.
  - `schema.prisma` vs SQL drift (static): 5 tables with no model (`push_token`, `account_deletion`, `pass_registration`, `pass_state`, `schema_migration`); `refresh_token.first_seen_at`, all `terminal_release.*_at`, `push_token.*`, `account_deletion.*` are `timestamptz` while Prisma `DateTime` maps to `timestamp(3)`; partial indexes `person_nationality_idx`, `account_deletion_due_idx`, `terminal_release_current_idx`; FK `person_home_branch_id_fkey` not in the datamodel; `uq_ledger_account_identity`, both ledger CHECKs, all triggers, policies and 40+ functions. `prisma migrate diff` would report all of it; `prisma db push` (nothing prevents an operator running it with `DIRECT_URL`) would **drop** the five SQL-only tables and the extra indexes/constraints.
  - `"db:migrate": "prisma migrate deploy"` with no `prisma/migrations/` directory is a no-op that creates `_prisma_migrations`; it is wired into the root `turbo run db:migrate`.
  - `apply-sql.ts` applies the 28 incremental files but never inserts into `schema_migration`, so the API's first boot on a `db:apply`-bootstrapped database re-runs all 28 (idempotent by contract, but `2026-07-28_superadmin_control.sql:13 UPDATE brand SET governance_mode = 'approval_required' WHERE governance_mode = 'autonomous'` is a data change that re-fires).
  - The migrator records a SHA-256 per file (`:165`) but never compares it on later boots, so an edited applied file diverges silently from what production ran.
- **Impact:** Nobody can state what production's schema is from the repo alone; a future `prisma db push`/`migrate` is destructive; CI's "fresh" database may not match prod.
- **Fix (M):** Delete `packages/db/migrations/` after folding the partial index into a new dated file; remove/rename `db:migrate` and add a guard script that refuses `prisma db push|migrate` unless `ALLOW_PRISMA_MIGRATE=1`; make `apply-sql.ts` write `schema_migration` rows; have the migrator fail (or at least log loudly) on checksum mismatch; run `prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` against production once, read-only, and commit the output as `docs/schema-drift-2026-10.md`.

### DB-13 — Tables holding sensitive data sit outside RLS, and default privileges hand the runtime role read/write on every future table
- **Severity:** Medium (defence-in-depth; no direct exposure found in current call sites) · **Confidence:** Confirmed
- **Location:** `2026-07-28_person_access_and_receipts.sql:103-106` (`receipt`: "Deliberately NOT RLS-gated", `GRANT SELECT, INSERT, UPDATE`); `2026-08-04_push_tokens.sql:43`; `2026-08-06_pass_registrations.sql:121-122`; `2026-08-05_account_deletion.sql:142`; `rls.sql:113-119`
- **Evidence:** `receipt` carries `masked_pan`, `auth_no`, `member_name`, `gross/net/discount_minor`, `membership_id`, `brand_id` for every sale on the platform and is readable/updatable by `loyalty_app` with no policy. `push_token` (Expo/APNs tokens → person), `pass_registration` (APNs tokens per membership), `account_deletion.reason` (free text) are the same. `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loyalty_app` means `schema_migration` (created by the owner at boot) is writable by the runtime role. All current call sites filter by token or platform (`receipt-public.controller.ts:28`, `superadmin.service.ts:857-865`), so exposure today requires SQL injection or a future unscoped query — but one injection (none found in the 75 raw call sites; all use tagged templates or whitelisted `Prisma.raw` from `FIELD_COL`/`OP_SQL`) also allows `set_config('app.current_platform_id', ...)` i.e. a full tenant switch.
- **Fix (S):** `ALTER TABLE receipt ENABLE ROW LEVEL SECURITY` with a brand/group/platform policy plus a SECURITY DEFINER `ereceipt_by_token(text)` for the public page; policies keyed on `person_id = app.current_actor_id` for `push_token`/`account_deletion`; `REVOKE ALL ON schema_migration FROM loyalty_app`; replace the blanket default privilege with explicit grants per migration (the dated files already do this).

### DB-14 — Prepaid/PII key management: single env master key, no key version on ciphertext, no rotation path; backups retain decryptable PII
- **Severity:** Medium · **Confidence:** Confirmed (code); backup tier Not assessed
- **Location:** `apps/api/src/auth/crypto/envelope-crypto.service.ts:16-19`; `2026-08-03_pii_backfill.sql`; `docs/security.md:16,21` (both unchecked)
- **Evidence:** `PII_MASTER_KEY_BASE64` is read once; no `kid`/version is stored with `phone_enc`/`email_enc` (grep for `version|kid|rotat` in the crypto service → nothing). The only re-encryption tool (`pii_set_encrypted`, `pii-backfill.service.ts`) encrypts rows detected as plaintext; it cannot re-key ciphertext. Crypto-shred (DB-11) nulls the ciphertext but every PITR snapshot/backup still holds it, decryptable with the key that lives in DO's env store.
- **Fix (M):** Prefix ciphertext with a key id, support N keys in env, add a `pii_rekey` sweep; document backup retention so "deleted" rows age out of backups within a stated window.

### DB-15 — `idempotency_key` can never be purged, and append-only/outbox tables have no retention or partial indexes
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `0001_baseline.sql:1423` (`journal.idempotency_key_id ... ON DELETE SET NULL`); `ledger.sql:20-28` (`no_mutation BEFORE UPDATE OR DELETE ON journal`); `schema.prisma:675` (`outbox @@index([publishedAt])`); no `deleteMany` on `idempotencyKey`/`outbox`/`auditLog` anywhere in `apps/api/src`
- **Evidence:** Deleting an `idempotency_key` row that a journal references fires `SET NULL` on `journal` → the `no_mutation` trigger raises → the delete fails. Every POS earn/redeem leaves a permanent row with a JSON `response`. `claim_txn_alerts` scans `WHERE published_at IS NULL AND aggregate = 'points'` via the full `(published_at)` btree; as published rows dominate, a partial index is the right shape.
- **Fix (S):** `CREATE INDEX CONCURRENTLY outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;` same for `webhook_delivery (brand_id, created_at) WHERE status = 'pending'`; decide a retention for idempotency keys (e.g. 90 days) and either drop the FK (keep `idempotency_key_id` as a plain column) or exempt the SET NULL path from the trigger by checking `pg_trigger_depth()`/a session GUC set only by the purge job.

### DB-16 — Append-only guards are per-row UPDATE/DELETE triggers only: TRUNCATE is not covered, the owner can `DISABLE TRIGGER`, and hold/void journals carry no legs
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `ledger.sql:20-28`, `:54-58`; `rls.sql:310-313`; `operations.ts:289-298` (`legs: []`), `:375-384`
- **Evidence:** `BEFORE UPDATE OR DELETE ... FOR EACH ROW` — no `TRUNCATE` trigger; `loyalty_app` is granted only `SELECT, INSERT, UPDATE, DELETE` (`rls.sql:114`), so it cannot TRUNCATE (positive), but the owner/migrator can and `entry.journal_id ... ON DELETE CASCADE` would make a `TRUNCATE journal CASCADE` remove all entries. `journal_balanced` is a `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED FOR EACH ROW AFTER INSERT ON entry`, so it is evaluated at COMMIT once per inserted leg (correct: legs inserted in separate statements of one transaction are still checked together; a single leg committed alone fails). But a journal with zero entries never triggers it: `redeem_auth` and `void` journals are audit stubs, so `pending_debits` cannot be rebuilt from `journal`+`entry` alone; `terminal_transaction.points` is the only record of a hold's size.
- **Fix (S):** Add `CREATE TRIGGER no_truncate BEFORE TRUNCATE ON journal/entry/audit_log FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation()`; record holds as entries against a `points_held` contra account (balanced), or at minimum store `amount_minor` on the stub journal.

### DB-17 — Ledger engine race recovery runs inside an already-aborted transaction; idempotency reservation is find-then-create
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `engine.ts:87-119`, `:279-305`
- **Evidence:** `getOrCreateAccount` catches the unique-index violation and re-runs `find()` on the same `tx`. In Postgres a constraint violation aborts the transaction; the re-read fails with `current transaction is aborted` and the whole request fails (first-ever earn for a member hit by two tills at once). `reserveIdempotency` does `findUnique` → `create` with no `FOR UPDATE`/`ON CONFLICT`; a concurrent duplicate gets P2002 and a 500 instead of the stored replay (the retry succeeds, so money is safe, but the terminal sees an error on a request that was in fact applied).
- **Fix (S):** Use `INSERT ... ON CONFLICT (…) DO NOTHING RETURNING id` then select; or wrap the create in a `SAVEPOINT` via `$executeRaw`.

### DB-18 — Time and identifier types are inconsistent: 103 `timestamp(3)` (no tz) columns from the baseline vs `timestamptz` in later files; `now()` written by SQL functions; UUIDv7 client-side vs `gen_random_uuid()` (v4) in SQL; `TEXT` primary keys
- **Severity:** Low · **Confidence:** Confirmed (the local test cluster logged `+04`, confirming non-UTC sessions exist in dev)
- **Location:** `0001_baseline.sql` (0 × `TIMESTAMPTZ`, 103 × `TIMESTAMP(3)`); `2026-08-03_wallet_sessions.sql:14-17` (`first_seen_at TIMESTAMPTZ` compared against `created_at timestamp(3)`); `2026-07-28_otp_code.sql:29` (`now_ts timestamp(3) := now()`); `schema.prisma:9` ("UUID v7 ... generated client-side") vs `gen_random_uuid()::text` in `terminal_enroll_person`, `wallet_join_brand`, `wallet_scan_code`
- **Impact:** Correct only while every session's `TimeZone` is UTC (Supabase default; embedded dev is not). `TEXT` UUIDs cost ~2× index space versus native `uuid`; mixed v4/v7 defeats the stated time-ordering goal for rows created by SQL.
- **Fix (M, later):** `ALTER ROLE loyalty_app SET timezone = 'UTC'` now (cheap); plan a `timestamptz` conversion and `uuid` typing as a maintenance migration.

### DB-19 — Seed script has no production guard and creates demo admins with a published password
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `packages/db/prisma/seed.ts:12-16`, `:272-273`; `package.json:21` (`db:seed`)
- **Evidence:** `new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL })`, `const DEMO_PASSWORD = 'ChangeMe123!'`, no `NODE_ENV`/hostname check; it is additive (`upsert`×10, `create`×7) so it will happily insert demo tenants and an admin with a known password into whatever `DIRECT_URL` points at.
- **Fix (S):** Refuse unless `NODE_ENV !== 'production'` **and** the host is `localhost`/`127.0.0.1`, or `SEED_I_KNOW_WHAT_I_AM_DOING=1`.

### DB-20 — Integer DTOs are unbounded at the JS/bigint boundary
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/terminal-gateway/dto.ts:59-69,97-166` (`@IsInt() @Min(0)`, no `@Max`); `terminal.service.ts:666-667` (`BigInt(dto.amountMinor)`, `BigInt(r.decision.points)`)
- **Evidence:** `Number.isInteger(1e300)` is true, so `@IsInt` accepts it; `BigInt(1e300)` is a valid bigint > `int8` max → Postgres `value out of range` → 500. `BigInt(x)` throws `RangeError` for any non-integer the rules engine might produce (multipliers in bps).
- **Fix (S):** `@Max(Number.MAX_SAFE_INTEGER)` (or a business cap like 1e12 minor units) on every money/points DTO; `BigInt(Math.trunc(...))` with an explicit rounding policy in one place.

### DB-21 — Boot migrator: no rollback path, non-verified checksums, data migrations in the boot path, and a `DROP FUNCTION` pattern that breaks image rollback
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `schema-migrator.ts:159-181`; `2026-08-03_profile_and_alerts.sql:42` (`DROP FUNCTION IF EXISTS public.wallet_update_profile(text, text, text, date)`); `2026-08-03_claim_alerts_settled.sql:12-18`; `2026-07-28_superadmin_control.sql:13`
- **Evidence:** One transaction per file (good), advisory lock (good), ledger table (good). But: the checksum is stored and never read back; there are no down files, so rolling the API image back to a build older than 2026-08-03 leaves it calling a function signature that no longer exists; `UPDATE brand ...` and `UPDATE refresh_token SET first_seen_at = created_at` (`wallet_sessions.sql:17`) are data changes executed at container start with the same timeout/lock profile as DDL. `CREATE INDEX` without `CONCURRENTLY` is used only on new/small tables so far (`person_nationality_idx` is the one on a hot table and `person` is small) — acceptable today, but the pattern will bite the first time an index is added to `entry`.
- **Fix (S):** Verify checksums (warn in prod, fail in CI); keep old function overloads for one release; move data backfills to a separate `backfills/` list run by an explicit command; document "forward-only; rollback = roll forward with a fix".

### DB-22 — Cross-platform identity: `person.phone_hash` is globally unique and definer functions resolve it without checking `platform_id`
- **Severity:** Low (single platform today) · **Confidence:** Confirmed
- **Location:** `schema.prisma:587` (`@unique phone_hash`); `rls.sql:349-366` / `person_access_and_receipts.sql:42-64` (`terminal_enroll_person` looks up by hash only, ignores `p_platform_id` when found); `customer_wallet.sql:159-178` (`wallet_discoverable_brands` has no platform filter)
- **Impact:** A second platform would share and overwrite `person` rows with the first; brands of every platform are listed to every wallet.
- **Fix (S):** `WHERE phone_hash = p_phone_hash AND platform_id = p_platform_id`; unique `(platform_id, phone_hash)`; platform filter in discover.

### DB-23 — Loyalty-id generation collides under concurrent enrolment
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `terminal.service.ts:243` (`PP-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random()*90+10)}`); `schema.prisma:634` (`@@unique([brandId, loyaltyId])`)
- **Evidence:** Two enrolments in the same millisecond have a 1/90 chance of the same id → unique violation → enrolment 500 with no retry. (`wallet_join_brand` uses `md5(uuid)` prefix, a different scheme — two formats for the same identifier.)
- **Fix (S):** Derive from the membership UUID, or loop on P2002.

### DB-24 — Transaction client escapes its transaction scope (`void this.emailReceipt(tx, …)`)
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `terminal.service.ts:401`, `:433-448`
- **Evidence:** The receipt email is fired-and-forgotten with the interactive `tx` handle; the enclosing `tenants.run` resolves and commits while the email path may still issue queries on `tx`, which then fail with `Transaction already closed` (or, if it is quick enough, run inside the POS request's transaction and extend it by an HTTP call to Resend).
- **Fix (S):** Collect the data inside the transaction, send after commit with the plain client.

### DB-25 — Info: `ALTER TYPE … ADD VALUE` in the uncommitted membership migration is safe on this stack
- **Severity:** Info · **Confidence:** Confirmed
- **Location:** `2026-08-06_membership_load_spend.sql:21-29`; `schema-migrator.ts:166-168`
- **Evidence:** The migrator wraps each file in `BEGIN … COMMIT`. `ALTER TYPE … ADD VALUE IF NOT EXISTS` inside a transaction block is permitted from PostgreSQL 12 (the new value just cannot be *used* in the same transaction, and this file does not use it). CI runs `postgres:16`, local embedded is 17.10, Supabase is ≥15. No action needed; do not add statements that reference `'load'`/`'spend'` to this same file.

### DB-26 — Info: `_prisma_migrations` safeguard in `rls.sql` is dead code
- **Severity:** Info · **Location:** `rls.sql:121-130` — the table never exists because Prisma Migrate is not used; harmless.

---

## 2. RLS coverage matrix (62 tables: 57 Prisma models + 5 SQL-only)

Policy legend: **BH** = brand-hierarchy `brand_id|group_id|platform_id` (`rls.sql:156-187`); **P** = platform-only; **G** = group|platform; **self** = own id; **membership** = platform OR member-of-scope (`rls.sql:320-343`); **actor** = platform OR `person_id = actor`; **none** = no policy row; **FORCE** = also applies to owner.

| Table | RLS | Policy | brand_id / group_id / platform_id indexed? | Assessment |
|---|---|---|---|---|
| platform | ENABLE | self (P) | n/a | OK |
| tenant_group | ENABLE | self or P | platform ✓ | OK |
| brand | ENABLE | self / G / P | group ✓ platform ✓ | OK |
| branch | ENABLE | BH | brand ✓ group ✓ platform ✗ | OK |
| terminal | ENABLE | BH | brand ✓ group ✗ platform ✗ | OK |
| api_key | ENABLE | BH | brand ✓ group ✓ platform ✗ | OK |
| role_assignment | ENABLE | BH | brand ✓ group ✓ platform ✓ | OK |
| user_account | ENABLE | P | platform ✓ | OK (login path uses owner? No — see note: `auth.service.ts` uses `this.db` directly; acceptable only if P context or definer) |
| refresh_token | ENABLE | P | platform ✓ | OK; wallet sessions via definer |
| person | ENABLE | membership | platform ✓ (EXISTS uses cm(person_id,brand_id) ✓) | OK |
| customer_membership | ENABLE | BH | brand ✓ group ✓ platform ✗ | OK |
| customer_identifier | ENABLE | BH | brand ✓ (leading col of unique) group ✗ platform ✗ | OK |
| outbox | ENABLE | BH | brand ✓ group ✗ platform ✗ | OK (relay via definer) |
| idempotency_key | ENABLE | BH | brand ✓ group ✗ platform ✗ | OK |
| audit_log | ENABLE | BH + no_mutation | brand ✓ group ✗ platform ✓ | OK |
| governance_config | ENABLE | BH | brand ✓ | OK |
| change_request | ENABLE | BH | brand ✓ platform ✓ | OK |
| coupon | ENABLE | BH | brand ✓ | OK |
| coupon_redemption | ENABLE | BH | brand ✓ | OK |
| segment | ENABLE | BH | brand ✓ | OK |
| notification_template | ENABLE | BH | brand ✓ | OK |
| ledger_account | ENABLE | BH | brand ✓ group ✓ | OK (see DB-04) |
| journal | ENABLE | BH + no_mutation | brand ✓ group ✓ | OK |
| entry | ENABLE | BH + no_mutation + balanced | brand ✓ group ✗ | OK |
| account_balance | ENABLE | BH + CHECK | brand ✓ group ✓ | OK |
| group_wallet | ENABLE | G | platform ✓ group ✓(unique) | OK |
| cost_rule | ENABLE | G | group ✓ | OK |
| earn_rule | ENABLE | BH | brand ✓ | OK |
| redemption_config | ENABLE | BH (also re-declared in its own file) | brand ✓ | OK |
| tier | ENABLE | BH | brand ✓ | OK |
| reward_catalog_item | ENABLE | BH | brand ✓ | OK |
| voucher | ENABLE | BH | brand ✓ | OK |
| terminal_transaction | ENABLE | BH | brand ✓ group ✗ platform ✗ | OK; group scan (DB-06) |
| campaign | ENABLE | BH | brand ✓ | OK |
| badge / badge_award | ENABLE | BH | brand ✓ | OK |
| challenge / challenge_progress | ENABLE | BH | brand ✓ | OK |
| referral | ENABLE | BH | brand ✓ | OK |
| webhook_endpoint / webhook_delivery | ENABLE | BH | brand ✓ | OK |
| brand_daily_metric / rfm_snapshot | ENABLE | BH | brand ✓ | OK |
| partner | ENABLE | P or enabled-merchant EXISTS | platform ✓(unique) | OK |
| partner_merchant | ENABLE | BH | brand ✓ | OK |
| allowance_wallet / allowance_txn / conversion / allowance_topup_request | ENABLE | BH | brand ✓ | OK |
| partner_customer_link | ENABLE | actor | none on platform/person | OK (small) |
| otp_code | ENABLE | **none** (fail-closed; definer only) | PK phone_hash | OK by design |
| terminal_release | ENABLE + **FORCE** | **wrong GUC** | platform ✓ | **Broken — DB-03** |
| receipt | **no** | — | (brand_id, created_at) | **Tenant data outside RLS — DB-13** |
| push_token | **no** | — | person ✓ | Sensitive (device tokens) — DB-13 |
| pass_registration / pass_state | **no** | — | serial ✓ | Sensitive (APNs tokens) — DB-13 |
| account_deletion | **no** | — | partial due idx | Free-text reason — DB-13 |
| rbac_role / rbac_permission / rbac_role_permission | **no** | — | — | Acceptable (global reference) |
| impersonation_session | **no** | — | actor ✓ | Acceptable (superadmin-only writes) but readable by any runtime session |
| schema_migration | **no** | — | PK | Writable by loyalty_app via default privileges — DB-13 |

Note on `user_account`/`refresh_token`: admin login (`auth.service.ts:287`) reads `user_account` through the plain client with no GUC. Under `loyalty_app` the P policy returns zero rows — i.e. **admin login cannot work under the RLS role** unless the connection is the owner. This mirrors DB-01 and should be verified by the auth auditor (08); listed here because it is the same root cause (ENABLE-not-FORCE + silent owner fallback masks it in dev/CI).

## 3. Constraint matrix — ledger and money-adjacent tables

| Table | PK | UNIQUE | CHECK | FK (ON DELETE) | NOT NULL (key cols) | Triggers |
|---|---|---|---|---|---|---|
| ledger_account | id text | `uq_ledger_account_identity` (ledger, account_type, asset_code, group_id, coalesce(brand_id,''), coalesce(customer_id,'')) | — | — (brand_id/group_id/customer_id have **no FK**) | ledger, account_type, normal_side, asset_code, platform_id, group_id | — |
| journal | id | — | — | reverses_id → journal SET NULL; idempotency_key_id → idempotency_key **SET NULL (blocked by trigger, DB-15)** | ledger, kind, occurred_at, platform_id, group_id | `no_mutation` BEFORE UPDATE OR DELETE FOR EACH ROW (no TRUNCATE) |
| entry | id | — | `entry_amount_positive (amount_minor > 0)` | journal_id → journal **CASCADE**; account_id → ledger_account RESTRICT | journal_id, account_id, direction, amount_minor, asset_code | `no_mutation`; `journal_balanced` CONSTRAINT TRIGGER AFTER INSERT DEFERRABLE INITIALLY DEFERRED FOR EACH ROW (Σ=0 and single asset per journal) |
| account_balance | account_id (= unique) | — | `account_balance_non_negative` (credit-normal: credits−debits−pending_debits ≥ 0) — **no `pending_debits ≥ 0` (DB-02)** | account_id → ledger_account CASCADE | all amounts default 0 | — (lock_version never checked) |
| idempotency_key | id | (actor_id, key) — scope = actor only, not brand | — | — | actor_id, key, request_hash, platform_id | — |
| voucher | id | code (global) | — | catalog_item_id → reward_catalog_item SET NULL; membership_id **no FK** | brand_id, group_id, platform_id, membership_id, code, points_spent | — |
| terminal_transaction | id | (actor_id, idempotency_key) | — (no state-machine CHECK; no `points > 0`) | **no FKs** (brand/branch/terminal/membership) | brand_id, group_id, platform_id, actor_id, intent, idempotency_key | — |
| receipt | id | token | — | **no FKs** | token, brand_id, group_id, platform_id, order_no | — ; **no unique (brand_id, order_no)** |
| referral | id | code | — | **no FKs**; **no unique (referrer, referee)** — a referee can be attached to one referral only by app logic | brand_id, referrer_membership_id, code | — |
| coupon / coupon_redemption | id | coupon (brand_id, code) | — (**no `redeemed_count <= max_redemptions`**) | coupon_redemption.coupon_id → coupon CASCADE | — | — ; **no unique (coupon_id, membership_id)** (DB-10) |
| badge_award | id | (badge_id, membership_id) | — | badge_id → badge CASCADE (deleting a badge deletes award history + journal link) | — | — |
| challenge_progress | id | (challenge_id, membership_id) | — (no `progress ≥ 0`) | challenge_id → challenge CASCADE | — | — |
| conversion | id | (brand_id, idempotency_key) | — | **no FKs** | all amounts NOT NULL | — |
| allowance_wallet | id | (partner_id, brand_id) | — (**no `balance_minor ≥ 0`**, DB-10) | **no FKs** | balance_minor default 0 | — |
| person | id | phone_hash (global), email_hash (global) | — | home_branch_id → branch SET NULL | platform_id | — |
| customer_identifier | id | (brand_id, type, value_hash) | — | membership_id → customer_membership CASCADE | — | — |
| user_account | id | (platform_id, email_lower) | — | — | — | — |
| refresh_token | id | token_hash | `refresh_token_subject_check` (exactly one of user_id/person_id) | user_id → user_account CASCADE; person_id → person CASCADE | platform_id, token_hash, expires_at | — |
| partner_customer_link | id | (partner_id, person_id) | — | **no FKs** | — | — |

Cascade risk summary: the only cascades that can touch ledger rows are `entry.journal_id → journal` (unreachable while `no_mutation` stands) and `account_balance → ledger_account` (an account with entries is RESTRICTed). `customer_membership.person_id → person CASCADE` would orphan `ledger_account.customer_id`, `voucher`, `terminal_transaction`, `badge_award`, `challenge_progress`, `referral`, `rfm_snapshot`, `conversion` (no FKs) — currently unreachable because deletion anonymises instead of deleting, and `eraseCustomer` (`loyalty.service.ts:556-563`) only archives.

## 4. Missing-index list (with the query that scans)

| # | Index to add | Query that currently scans | Where |
|---|---|---|---|
| 1 | `ledger_account (customer_id, account_type) WHERE customer_id IS NOT NULL` | `SELECT … FROM ledger_account WHERE ledger='points' AND account_type='points_liability' AND brand_id=$1 AND customer_id=$2 AND asset_code=$3` | `engine.ts:75`, `loyalty.service.ts:81`, `wallet_cards`, `wallet_pass_data` (DB-04) |
| 2 | `terminal_transaction (group_id, created_at) WHERE intent='redeem' AND state='captured' AND settled_at IS NULL` | `SELECT id FROM terminal_transaction WHERE group_id=$1 AND intent='redeem' AND state='captured' AND settled_at IS NULL LIMIT 200` | `settlement.service.ts:21-26` (DB-06) |
| 3 | `entry (account_id, expiry_bucket) WHERE direction='credit' AND expiry_bucket IS NOT NULL` (+ query rewrite) | expiry aggregate `LEFT JOIN entry e ON e.account_id = la.id … FILTER (WHERE … expiry_bucket < current_date)` | `expiry-sweep.service.ts:19-31` (DB-05); also `expiring()` `loyalty.service.ts:162-167` |
| 4 | `outbox (created_at) WHERE published_at IS NULL` | `UPDATE outbox … WHERE id IN (SELECT o.id FROM outbox o WHERE o.published_at IS NULL AND o.aggregate='points' ORDER BY created_at LIMIT n FOR UPDATE SKIP LOCKED)` | `claim_txn_alerts`; `webhook.service.ts:155` |
| 5 | `webhook_delivery (brand_id, created_at) WHERE status='pending'` | `findMany({ where: { brandId, status:'pending' }, take: 100 })` | `webhook.service.ts:186-190` |
| 6 | `journal (brand_id, occurred_at)` | reporting/analytics range queries `WHERE j.brand_id=$1 AND j.occurred_at >= $2` | `reporting.service.ts:130-200`, `analytics.service.ts:176-240` |
| 7 | `audit_log (brand_id, created_at DESC)` | audit listing `WHERE brand_id=$1 ORDER BY created_at DESC LIMIT 50` (today: brand_id idx + sort) | manage audit endpoints |
| 8 | `terminal_transaction (brand_id, created_at DESC)` and `(brand_id, created_at) WHERE state='authorized'` | brand transaction listings; future hold-expiry sweep (DB-09) | superadmin/manage, DB-09 |
| 9 | `receipt (membership_id, created_at)` | `SELECT token FROM receipt WHERE brand_id=$1 AND membership_id=$2 AND created_at >= $3 ORDER BY created_at DESC LIMIT 1` | `txn_alert_context` |
| 10 | `coupon_redemption (coupon_id, membership_id)` UNIQUE partial | `count({ where: { couponId, membershipId } })` + race | DB-10 |
| 11 | `voucher (reserved_at) WHERE reserved_at IS NOT NULL` | `updateMany({ where: { brandId, status:'reserved', reservedAt: { lt } } })` — the legacy file defined it; baseline dropped it | `terminal.service.ts:87-95`; DB-12 |
| 12 | `voucher (catalog_item_id)`, `person (home_branch_id)` | FK `SET NULL` on parent delete (full scan of child) | superadmin deletes |
| 13 | `referral (referee_membership_id)` | referral qualification lookup by referee | gamification/referral service (not read; Needs verification) |

Present and correct for the hot paths listed in the brief: `account_balance` PK by account; `refresh_token(token_hash)`; `otp_code` PK + `(expires_at)`; `customer_identifier(brand_id,type,value_hash)`; `receipt(token)`, `(brand_id, created_at)`; `rfm_snapshot(brand_id, as_of)`, `(brand_id, segment)`; `brand_daily_metric(brand_id, date)`; `entry(account_id)` for history; `voucher(membership_id)`; `terminal_transaction(membership_id)` for `priorEarns`; `api_key(publishable_id)`; `customer_membership(person_id, brand_id)`.

RLS predicate note: the `brand_id = … OR group_id = … OR platform_id = …` chain is evaluated with `current_setting()` (STABLE), so for custom plans the unset clauses fold to NULL and the brand index is used; the policy therefore costs an extra `brand_id` filter, not a seq scan, on every table that has a `brand_id` index (all BH tables do, via a single or leading-column index). Group/platform principals pay full scans on tables without `group_id`/`platform_id` indexes (`terminal`, `customer_identifier`, `outbox`, `idempotency_key`, `entry`, `terminal_transaction`, `voucher`, every W4/W5 table) — tolerable for superadmin reporting, a problem for the group-scoped settlement worker (row 2 above).

## 5. Migrations — summary of mechanics verified

- Boot path: `main.ts:29-36` → `applyPendingMigrations` with `DIRECT_URL ?? DATABASE_URL` (owner). `pg_advisory_lock(4820117)` (session-level, released in `finally` and on disconnect) → `CREATE TABLE IF NOT EXISTS schema_migration` → skip names already present → per file `BEGIN; <file>; INSERT … ON CONFLICT DO UPDATE; COMMIT` with `ROLLBACK` + throw on error → boot aborts. Two instances serialise correctly (`schema-migrator.e2e.test.ts:71-81`). Worker skips via `ROLE=worker`. Half-applied files cannot exist (single transaction per file); a failing file is retried next boot.
- Not transactional-safe inside a file: none found (no `CREATE INDEX CONCURRENTLY`, no `VACUUM`).
- `rls.sql`/`ledger.sql`/baseline are deliberately outside the auto list (`migrations.ts:10-13`); `docs/deployment.md:7-9` says to apply them by hand — meaning a **policy change** (e.g. the DB-03 fix, or any future `rls.sql` edit) has no automated path to production unless it is also written as a dated file. The `person` policy already exists in two places that must be kept in sync (`rls.sql:315-343` and `person_access_and_receipts.sql:16-39`).

## 6. Transactions & isolation — summary

| Concern | Mechanism | Verdict |
|---|---|---|
| Balance overdraw | Conditional `UPDATE … WHERE available >= amt` (`engine.ts:128-135,149-156,249-256`) + CHECK | Correct, race-safe (tested: `ledger.test.ts:187,256`) |
| Hold release | Unconditional (`engine.ts:159`) | **DB-02** |
| State transitions (terminal txn) | read → check → unconditional update, no FOR UPDATE | **DB-02**, DB-09 |
| Idempotency reserve | find → create; unique `(actor_id,key)` catches the race with an error | DB-17 (safe, ugly) |
| Account create race | unique index; recovery re-read inside aborted tx | DB-17 |
| Coupon / allowance counters | read → check → increment; no CHECK/unique | **DB-10** |
| OTP verify | `SELECT … FOR UPDATE` inside definer (`otp_code.sql:69`) | Correct |
| Outbox claim / deletion sweep | `FOR UPDATE SKIP LOCKED` in definer functions | Correct |
| Settlement double-run | two instances may both pick the same id; second fails on idempotency unique → logged | Safe |
| `set_config(..., true)` | only inside `$transaction` (`tenant.service.ts:30`); no `SET`/`set_config` outside a transaction anywhere in `apps/api/src` | Correct for Supavisor transaction mode |
| Prepared statements | `pgbouncer=true` in URL template (`.env.example:7`) | Correct (Needs verification that the real `APP_DATABASE_URL` carries it) |
| Isolation level | default READ COMMITTED everywhere; `docs/00-research-notes.md:148` promised REPEATABLE READ/SERIALIZABLE for redemption critical sections | Not implemented; acceptable only if DB-02 fix lands |
| Timeouts / pool | defaults | **DB-07** |

## 7. Not assessed

- Supabase project: Postgres major version, PITR/backup tier, retention, whether a restore has ever been drilled, `max_connections`, Supavisor pool size and mode, whether `loyalty_app` was created `NOINHERIT NOBYPASSRLS` as documented and whether the Supabase `postgres` role carries `BYPASSRLS` (affects how much the `DATABASE_URL` fallback bypasses). Nothing was connected to.
- Actual production schema vs repo (`prisma migrate diff --from-url`), including whether `voucher_reserved_at_idx`, the two 2026-07-28 data fixes, and the DB-03 policy exist as in the files.
- Live query plans / table sizes (`pg_stat_user_tables`, `pg_stat_statements`); all index findings are from static analysis of predicates versus declared indexes.
- The local persistent dev cluster (`packages/db/.dev-pgdata`) was not running, so `prisma migrate diff` against it was not executed; the drift list in DB-12 is from reading the SQL.
- Partner-connector and allowance top-up flows beyond the counter race in DB-10 (domain 07/Partnerships).
- Admin-login RLS behaviour (`user_account` P policy with no GUC) — flagged in §2 for the auth auditor.

## 8. Positive controls verified

- Double-entry invariants exist at the database, not only in code: `entry_amount_positive`, `account_balance_non_negative` (includes `pending_debits`), `assert_journal_balanced` deferred constraint trigger rejecting Σ≠0 and mixed assets at COMMIT (`ledger.sql`), unique account identity. `ledger.test.ts:236` proves the trigger fires on COMMIT; the suite's 25 tests pass locally in 9.9 s on PG 17.10.
- Append-only `journal`, `entry`, `audit_log` via `forbid_mutation` for UPDATE/DELETE; the runtime role has no TRUNCATE or DDL privileges (`rls.sql:114-115`).
- Balance mutations are atomic conditional updates on a single row, so overdraw under concurrency is impossible (`ledger.test.ts:187,256`).
- RLS is fail-closed (`nullif(current_setting(...,true),'')`), hierarchical, `USING` + `WITH CHECK` on 52 of 62 tables, with `TO loyalty_app` scoping; tenant GUCs are set only inside the request transaction (`set_config(..., true)`), which is correct for Supavisor transaction pooling.
- Every SECURITY DEFINER function (40+) sets `search_path = public`, has `EXECUTE` revoked from `public` and granted only to `loyalty_app`; person-scoped ones take `person_id` as a parameter and filter every join by it (`wallet_cards`, `wallet_vouchers`, `wallet_activity`, `wallet_sessions`, `wallet_revoke_session`, `wallet_set_home_branch` checks the branch belongs to a brand the person holds, `wallet_pass_data` checks ownership when a person is supplied). Raw SQL in the API uses tagged templates or whitelisted `Prisma.raw` fragments; no string-built SQL found.
- Boot migrator: advisory lock, one transaction per file, ledger table, fail-fast boot, TLS handling tested, idempotency of every file tested by running the list twice (`schema-migrator.e2e.test.ts`).
- `otp_verify` uses `FOR UPDATE`; `claim_txn_alerts` and `sweep_account_deletions` use `FOR UPDATE SKIP LOCKED`; one-message-per-sale settle window.
- Money and points are `BIGINT` end-to-end; BigInt is serialised as string at the API edge (`main.ts:4-6`); no `Decimal`/float columns for amounts.
- `dev-db.ts` and `check-dev.ts` are hard-wired to `localhost:5432`; `.env.example` separates owner/direct/app URLs clearly; `.do/app.yaml` declares `APP_DATABASE_URL` for both services.
- `refresh_token_subject_check` CHECK fixes the staff/customer subject ambiguity properly rather than by convention.
