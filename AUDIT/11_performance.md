# 11 — Performance & Scalability Audit

Audit date: 2026-10-10. Branch `main` @ afc3fe2 plus the uncommitted membership-card working tree (read; it adds a `LEFT JOIN branch` to three history queries and two new ledger ops, none of which change the findings below). Read-only. No source edits, nothing run against production. The local embedded Postgres was not running and was not started, so every latency/throughput number here is a back-of-envelope estimate derived from query shape, index inventory and round-trip counts, not a measurement. Where a number matters for a decision it is marked **estimate** and the load-test plan at the end is how to replace it with a measurement.

Deployment assumed (from `.do/app.yaml` and `00_system_map.md`): 2× DigitalOcean `basic-xs` API containers (1 shared vCPU, 512 MB–1 GB) + 1 identical `jobs` container, Supabase Postgres behind Supavisor (transaction pooler :6543, session pooler :5432), no Redis in use, in-memory throttler and nonce store. Load profile assumed: ~200 tills, 3–4 receipts/s steady, 20/s bursts; month-end expiry across all brands; campaign push to 50k customers producing ~100 rps of wallet reads; superadmin analytics.

Severity scale: Critical = financial-correctness or whole-API outage under the stated load; High = degraded service for a whole surface (tills, app, console) or runaway cost; Medium = one endpoint/job degrades or a predictable future cliff; Low/Info = hygiene.

---

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | PERF-01 |
| High | 10 | PERF-02 … PERF-11 |
| Medium | 10 | PERF-12 … PERF-21 |
| Low / Info | 7 | PERF-22 … PERF-28 |

The three structural problems that generate most of the list: (1) background jobs run as un-coordinated `setInterval`s on all three containers with no leader election and no jitter, so every "idempotent" job is actually run three times in near lock-step; (2) every request and every job runs inside a Prisma interactive transaction with the library defaults (`maxWait` 2 s, `timeout` 5 s) and no `statement_timeout`, which turns any slow query into a 500 and silently aborts the heavy jobs; (3) the `ledger_account` table has no plain index on `customer_id`, so the single most common lookup in the system (find a member's points account) walks the brand's or the platform's accounts.

---

## Findings

### PERF-01 — Point-expiry sweep is not concurrency-safe: three instances can each post a breakage journal for the same points
- **Severity:** Critical  **Confidence:** Likely (needs a two-process reproduction; reasoning below is from the SQL semantics)
- **Location:** `apps/api/src/modules/workers/expiry-sweep.service.ts:18-56`; scheduling `apps/api/src/modules/workers/worker-runner.service.ts:61-62, 77-88`; balance guard `packages/db/src/ledger/engine.ts:125-137`
- **Evidence.** The service comment claims idempotency: "Posts a breakage journal … which is itself a debit — making re-runs idempotent." That holds for *sequential* re-runs. The sweep is scheduled with `this.every('point-expiry', 3600, …)` on every container (`worker-runner.service.ts:61`), gated only by `SKIP_DB`, `NODE_ENV=test`, `WORKERS_ENABLED` (`:45-49`), and the `jobs` worker runs the same entrypoint. All containers are restarted together on deploy, so their 3600 s timers fire within seconds of each other, forever. Inside one tick:
  ```ts
  const rows = await tx.$queryRaw`SELECT la.id, coalesce(sum(e.amount_minor) FILTER (...), 0) AS earned_expired, ab.posted_credits, ab.posted_debits, ab.pending_debits ... GROUP BY ...`;   // :19-31  (plain SELECT, no lock)
  let toExpire = BigInt(r.earned_expired) - BigInt(r.posted_debits);                                   // :38
  if (toExpire > available) toExpire = available;                                                       // :39
  await ledger.postJournal(tx, { kind: 'expiry', legs: [{ accountId: r.id, direction: 'debit', amountMinor: toExpire }, …] }); // :46-53
  ```
  `postJournal` applies the debit with `UPDATE account_balance SET posted_debits = posted_debits + X WHERE account_id = $1 AND (posted_credits - posted_debits - pending_debits) >= X` (`engine.ts:128-134`). Under READ COMMITTED, instance B's SELECT (issued before A commits) sees the same `posted_debits` as A, computes the same `X`, then its UPDATE blocks on A's row lock and re-evaluates the WHERE against the *new* row. The guard is an overdraw guard, not a duplicate guard: if the member's remaining available balance is still ≥ X after A's debit, B's debit succeeds and a second `expiry` journal is posted. A third instance can do it again.
- **Impact.** A member with 3,000 available of which 1,000 are due to expire can lose 1,000 (correct), 2,000 or 3,000 depending on how many instances overlap. Breakage income is overstated by the same amount; the ledger stays balanced so the DB triggers do not catch it. Back-of-envelope: with three aligned instances and a per-brand sweep that takes 1–5 s (see PERF-02), overlap is the common case, not the rare one, for every brand whose sweep finishes inside the 5 s transaction timeout.
- **Scenario.** Month-end, 02:00: all three containers hit the hourly tick within 2 s of each other; brand with 5,000 members, 800 of whom have a bucket older than today. Each instance reads the same 800 rows and posts 800 breakage journals. Members with balance ≥ 2× their expiring lot are over-expired.
- **Fix.** Any one of: (a) run the sweep from one process only (leader via `pg_try_advisory_lock(hashtext('point-expiry:'||brand_id))` taken inside the same transaction, skip brand if not acquired — S); (b) make the per-account step atomic by locking the balance row before computing (`SELECT … FROM account_balance WHERE account_id = $1 FOR UPDATE`, recompute `toExpire` from the locked row, then post — S/M); (c) key the breakage journal on `(account_id, expiry_bucket)` with a unique constraint or an idempotency key `expiry:<account>:<bucket>` through `reserveIdempotency` so the second poster hits `idempotency_conflict` and skips — M. Do (a) now, (c) as the durable fix.
- **Effort:** S (advisory lock) / M (idempotent per-lot journal)

### PERF-02 — Expiry sweep is O(all entries of the brand) per hour per instance, in one 5 s-bounded transaction
- **Severity:** High  **Confidence:** Confirmed (shape) / Needs verification (timings)
- **Location:** `expiry-sweep.service.ts:18-58`; Prisma tx defaults: `apps/api/src/platform-core/tenancy/tenant.service.ts:22` (`this.prisma.$transaction(async (tx) => …)` — no options object anywhere in `apps/api/src` or `packages/db/src`; grep for `maxWait|timeout` returned nothing)
- **Evidence.** The aggregate `FROM ledger_account la JOIN account_balance ab … LEFT JOIN entry e ON e.account_id = la.id WHERE la.brand_id = $1 AND la.account_type = 'points_liability' GROUP BY …` touches every entry row of every member of the brand to compute `earned_expired`, then the loop posts one journal per account with expired points (`getOrCreateAccount` ×1, `journal.create`, 2× `entry.create`, 2× balance `UPDATE` ≈ 6 round trips per account, `engine.ts:205-244`). All of it runs inside a single `tenants.run` transaction whose Prisma default `timeout` is 5,000 ms.
- **Impact (estimate).** `entry` has only `(account_id)`, `(journal_id)`, `(brand_id)` indexes (`packages/db/prisma/schema.prisma:929-931`); no `(account_id, direction, expiry_bucket)`. At 1 M entries the per-brand aggregate is a hash join over the brand's entries (~0.5–2 s on shared compute); at 10 M it is ~5–20 s and the transaction is killed by the 5 s timeout with `P2028`, which `every()` logs as `point-expiry failed for brand …` and moves on. Net effect at scale: **points stop expiring at all for large brands**, liability never reduces, breakage is never booked — silently. Even when it fits, 800 accounts × 6 round trips ≈ 4,800 pooled round trips ≈ 5–10 s, again over the limit. Multiply by brands × 3 instances × 24/day: with 20 brands that is ~1,440 full-brand entry scans per day of pure duplicate work.
- **Scenario.** The e2e test (`expiring-points.e2e.test.ts`) passes with a handful of entries. First brand to reach ~50 k entries starts failing the hourly sweep; nobody notices because the failure path is a log line.
- **Fix.** Split into (1) one read query per brand *outside* a transaction that returns `(account_id, to_expire)` and (2) one short transaction per account (or per batch of 100) that locks the balance row and posts; raise the Prisma tx `timeout` explicitly for jobs; add index `entry (account_id, expiry_bucket) WHERE direction = 'credit'`; run daily at 02:00 not hourly; emit a metric for `accountsExpired`/`pointsExpired`/duration and alert when a brand's sweep fails twice. Longer term: maintain a per-(account, bucket) lot table at earn time so the sweep is an index range scan.
- **Effort:** M

### PERF-03 — `ledger_account` has no usable index for lookup by `customer_id`; every balance read and every earn walks the brand's accounts
- **Severity:** High  **Confidence:** Likely (no EXPLAIN run; conclusion from index definitions)
- **Location:** index inventory `packages/db/prisma/schema.prisma:880-882` (`@@index([brandId])`, `@@index([groupId])`, `@@index([ledger, accountType])`) and `packages/db/prisma/sql/ledger.sql:73-76`:
  ```sql
  CREATE UNIQUE INDEX uq_ledger_account_identity ON public.ledger_account (
    ledger, account_type, asset_code, group_id, coalesce(brand_id, ''), coalesce(customer_id, ''));
  ```
  Callers: `packages/db/src/ledger/engine.ts:73-88` (`getOrCreateAccount` → `findFirst({ where: { ledger, accountType, assetCode, groupId, brandId, customerId } })`), `apps/api/src/modules/loyalty-rules/loyalty.service.ts:81-92` (`findLiabilityAccount`), `packages/db/prisma/sql/2026-07-28_customer_wallet.sql:38-46` (`wallet_cards` lateral `WHERE la.account_type = 'points_liability' AND la.customer_id = cm.id`), `2026-08-06_wallet_pass_data.sql:40-45`, `superadmin.service.ts:540-547`.
- **Evidence.** Prisma emits `customer_id = $1`, not `coalesce(customer_id,'') = $1`, so the expression columns of the unique index cannot serve the predicate. The planner can use the four leading plain columns `(ledger, account_type, asset_code, group_id)`, which for `asset_code = 'PTS:<brand>'` selects *every points_liability account of the brand* (one per member), then filters `customer_id` on the heap. `findLiabilityAccount` omits `group_id` → prefix `(ledger, account_type, asset_code)` → same cardinality. The `wallet_cards` lateral has neither `ledger` nor `asset_code` → no index applies → a sequential scan of `ledger_account` per card row (nested loop).
- **Impact (estimate).** Brand with 50 k members: each `getOrCreateAccount` reads ~50 k index entries + heap checks ≈ 5–20 ms warm, far worse cold. An earn calls it 2× (`operations.ts:90, 103`) plus `lifetimeAndTier` 2× (`loyalty.service.ts:253, 279`) → ~4 scans ≈ 20–80 ms added per receipt at 20 rps = 0.4–1.6 Postgres CPU-s per second from this alone. `wallet/cards` at 100 rps burst with 5 cards each and 100 k accounts platform-wide: 500 seq scans/s of a 100 k-row table ≈ Postgres saturation; p95 for the home screen goes to seconds.
- **Scenario.** Campaign push → app opens → `/customer/wallet/cards` → every card does a seq scan → Supavisor queue → Prisma `maxWait` 2 s exceeded → `P2024` → 500s → users retry → worse.
- **Fix.** Add `CREATE INDEX ledger_account_customer_idx ON ledger_account (customer_id) WHERE customer_id IS NOT NULL;` and `CREATE INDEX ledger_account_brand_customer_type_idx ON ledger_account (brand_id, customer_id, account_type);` in a new `prisma/sql/*.sql` + schema `@@index([customerId])`. Also change `getOrCreateAccount` to `upsert`-style `INSERT … ON CONFLICT DO NOTHING RETURNING` so the common path is one round trip instead of find→create→find.
- **Effort:** S

### PERF-04 — Transaction-alert relay drains at well under one sale per second per instance, with no outbound timeouts and no lag metric
- **Severity:** High  **Confidence:** Confirmed (structure) / estimate (rates)
- **Location:** `apps/api/src/modules/workers/txn-alert.service.ts:48-72, 82-154`; `wallet-pass.service.ts:126-137`; `apns.service.ts:79-108`; `google-wallet.service.ts:145-197`; `sms-sender.service.ts:143-156`; scheduler `worker-runner.service.ts:52, 77-88`
- **Evidence.** `relay(limit = 50)` claims ≤50 outbox rows (SKIP LOCKED, good) then `for (const sale of groupBySale(rows)) { await this.handleSale(sale) }` — strictly sequential. Per sale: `passes.refresh()` → `passkit.notifyPassChanged()` (DB + **new HTTP/2 session to Apple per sale**, `apns.service.ts:88 connect(ApnsService.HOST)`) → `google.push()` which calls `accessToken()` → **a fresh OAuth token exchange to `oauth2.googleapis.com` on every push** (`google-wallet.service.ts:148, 184`; nothing caches the token) → PATCH; then `txn_alert_context` DB call, then Twilio POST. None of the `fetch` calls pass `AbortSignal.timeout` (grep `AbortSignal` over `apps/api/src`: no matches), and the http2 `connect` has no timeout. The `busy` set (`worker-runner.service.ts:79-84`) prevents overlap, so a tick that takes 90 s simply delays the next one.
- **Impact (estimate).** Twilio ~0.3–0.8 s, Google token+PATCH ~0.4–0.8 s, APNs connect+push ~0.2–0.5 s ⇒ ~1–2 s per sale ⇒ 50 sales ≈ 60–100 s per tick ⇒ **~0.5–0.8 sales/s per instance, ~1.5–2.5 /s across three**, below the 3–4 rps steady lunch rate. The backlog grows through every rush and drains afterwards; "an alert that arrives an hour late is worse than one that never arrives" (`:46`) is exactly what will happen. If one provider stalls (no timeout), that instance's relay never returns, `busy` never clears, and the instance is out of the relay until restart — with no metric to show it. There is no outbox age/lag gauge anywhere; `/metrics` (`health.controller.ts:31-42`) exposes process memory only.
- **Scenario.** Friday 13:00–14:00, 12,000 sales. Relay capacity ~7,000/hour. 5,000 customers get their "you earned" WhatsApp between 14:00 and 15:00; Twilio spend is unchanged but the cost of the feature (immediacy) is gone.
- **Fix.** (1) `AbortSignal.timeout(5000)` on every outbound `fetch` and a `setTimeout`-guarded `connect` for APNs; (2) cache the Google access token for its `expires_in` (same pattern as `ApnsService.providerToken`); (3) keep one APNs session per process (reconnect on error) instead of per sale; (4) process sales with bounded concurrency (`p-limit` 5–10) — Twilio/Google/Apple are all fine with that; (5) raise `limit` to 200; (6) export `outbox_unpublished_age_seconds` and `relay_tick_duration_seconds` from `/metrics` and alert at age > 120 s.
- **Effort:** M

### PERF-05 — Brand analytics and superadmin platform metrics are full-ledger scans on every request; the rollup/snapshot jobs exist only as manual POSTs
- **Severity:** High  **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/reporting/analytics.service.ts:17-258` (`clv` 3 scans, `visitFrequency` 2, `cohortRetention`, `churnRisk` 2, `liabilityAging`, `byBranch`, `engagement`); `reporting.service.ts:71-104` (`rfm`: `ntile(5)` over every member with an entry join), `:127-149` (`runDailyRollup`), `:107-124` (`snapshotRfm`: per-member `upsert` loop, up to 10,000 round trips in one transaction), `:152-176` (`superadminOverview`: `count(*) FROM journal`), `superadmin.service.ts:1098-1125` (`platformAnalytics` flow query `FROM journal j JOIN entry e … WHERE j.platform_id = $1` with no date bound); controller `reporting.controller.ts:22-145` exposes all of these as GETs; `WorkerRunner` schedules none of `runDailyRollup`/`snapshotRfm` (`worker-runner.service.ts:52-66`).
- **Evidence.** `BrandDailyMetric` and `RfmSnapshot` tables exist (`schema.prisma:1280-1316`) but nothing reads them for dashboards and nothing writes them on a schedule. Every analytics GET re-derives from `entry`/`journal`. `journal` has no `(brand_id, occurred_at)` index (`schema.prisma:906-909`): `pointsTrend`/`pointsByType`/`runDailyRollup` filter `j.brand_id = $1 AND j.occurred_at >= …` via the `brand_id` index and then filter dates across the whole brand history.
- **Impact (estimate).** At 1 M entries the brand reporting page (which calls summary, trend, by-type, rfm, clv, cohorts, churn, by-branch, engagement) issues ~15 scans of the brand's entry set per load ≈ 2–6 s of Postgres CPU per page view; at 10 M entries most individual queries exceed the 5 s Prisma transaction timeout and the page 500s. `platformAnalytics` sums every entry on the platform per superadmin dashboard load. `snapshotRfm` with 10 k members is 10 k `upsert` round trips in one transaction — guaranteed `P2028` above a few hundred members.
- **Scenario.** Superadmin opens Analytics during the lunch rush: a 4-second seq scan of `entry` competes with 20 rps of ledger writes on a 1-vCPU-class database; till latency doubles for the duration.
- **Fix.** Schedule `runDailyRollup` (nightly, per brand, previous day) and `snapshotRfm` (weekly) in `WorkerRunner` under the leader lock from PERF-01; serve `trend`/`by-type`/`summary` from `brand_daily_metric`; serve `rfm` from the latest `rfm_snapshot`; rewrite `snapshotRfm` as one `INSERT … SELECT … ON CONFLICT DO UPDATE`; add `journal (brand_id, occurred_at)` and `entry (account_id, direction)`; bound `platformAnalytics` flow to the last 90 days or read it from the rollup; add `Cache-Control: private, max-age=300` on the analytics GETs.
- **Effort:** M/L

### PERF-06 — Two Prisma clients per container, one on the session pooler / direct port, hit on every terminal request; pool sizes unset
- **Severity:** High  **Confidence:** Needs verification (Supabase tier and container CPU count are not in the repo)
- **Location:** `apps/api/src/platform-core/prisma/prisma.service.ts:15-18` (`new PrismaClient({ datasourceUrl: APP_DATABASE_URL ?? DATABASE_URL })`); `apps/api/src/auth/auth-prisma.service.ts:18-21` (`new PrismaClient({ datasourceUrl: DIRECT_URL ?? DATABASE_URL })`); `.env.example:7-11` (`DIRECT_URL` = `…pooler.supabase.com:5432` session mode, `DATABASE_URL`/`APP_DATABASE_URL` = `:6543?pgbouncer=true`, **no `connection_limit`, no `pool_timeout`**); `.do/app.yaml:26-28` (api gets `DIRECT_URL`; `jobs` at `:72-73` does not); `apps/api/src/auth/guards/terminal-hmac.guard.ts:61-63` (`await this.authDb.apiKey.findUnique(...)` on **every** terminal request); `otp-store.service.ts:35`, `auth.service.ts:181-256` (refresh, brand-token mint) also on `AuthPrismaService`.
- **Evidence.** Prisma's default pool is `num_physical_cpus * 2 + 1` per client. On a 1-vCPU container that is 3; if the Rust `num_cpus` sees the host it is larger. Each container therefore holds 2 pools: 3–9 transaction-mode connections plus 3–9 *session-mode* connections (each session-mode client connection pins a backend for its lifetime). Three containers ⇒ 18–54 pooler clients, of which 9–27 permanently pin backends. The owner-role migrator opens one more at boot (`schema-migrator.ts`). Supabase's default pooler `pool_size` is 15 per (role, database) on the smallest compute and direct `max_connections` is 60, with several reserved.
- **Impact (estimate).** Terminal requests cannot proceed without the HMAC guard's session-mode query; if the session pool is exhausted every till request waits `pool_timeout` (10 s default) then fails. Separately, every request path = `applyContext` (2–4 `set_config` round trips, `tenant.service.ts:28-51`) + N queries holding one of only ~3 transaction-mode connections per container. At 20 rps of earns at ~60–100 ms each (PERF-03 included) a container needs 1.2–2 connections busy; add the five jobs polling on the same pool and `maxWait` 2 s is reachable under a burst, which surfaces as `P2024` → 500 → the till enqueues to its outbox and replays (safe via idempotency, but the cashier sees "Earn queued").
- **Scenario.** Deploy with host-CPU detection = 4: each container opens 9 + 9. Pooler session slots are consumed by three idle API containers; the first `apiKey.findUnique` after the pooler's `pool_size` is reached waits and the whole till fleet stalls on auth.
- **Fix.** (1) Move `AuthPrismaService` to the transaction pooler (`:6543?pgbouncer=true` with the owner role) — nothing in it needs session semantics; keep `DIRECT_URL` for the migrator only; (2) set `?connection_limit=5&pool_timeout=5` explicitly on all three URLs and `connection_limit=2` for the auth client; (3) stop re-reading `api_key` per request: cache `publishableId → {secretEnc, status, scope}` in-process for 60 s (revocation lag 60 s is acceptable for a key that is also nonce-checked), or at minimum move the lookup to `PrismaService`; (4) set `SET statement_timeout = '8s'` for `loyalty_app` at the role level (`ALTER ROLE loyalty_app SET statement_timeout = '8s'`) so a runaway query dies in Postgres instead of leaving the pooled connection busy after Prisma gives up.
- **Effort:** S/M

### PERF-07 — Unbounded table growth with no purge job: `refresh_token` written on every brand-token mint, `outbox`, `webhook_delivery`, `idempotency_key`
- **Severity:** High  **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/auth.service.ts:234-255` (`brandTokenForWallet` → `this.tokens.issueRefresh(...)` + `this.storeRefresh(...)` → `refreshToken.create`, and the returned refresh token is never used by the client); mobile `apps/mobile/lib/api.ts:140-160` (`brandToken()` re-mints when `expiresAt - 30_000 <= Date.now()`, i.e. every ≤15 min per brand per device, and `brandTokens` is an in-memory `Map` cleared on every app start and every wallet refresh `:106`); `refreshWallet` `auth.service.ts:181-231` (rotation inserts a row and marks the old one `revokedAt`; nothing deletes); outbox: `outbox.service.ts:19-28` + `claim_txn_alerts` (`2026-08-03_claim_alerts_settled.sql:23`) only sets `published_at`; `webhook.service.ts:165-175` inserts a delivery per endpoint per event; `engine.ts:292-303` inserts an `idempotency_key` row with the JSON response for every ledger op; grep for `deleteMany|DELETE FROM` in `apps/api/src` finds only role/governance/api-key deletes; `otp_prune()` exists (`2026-07-28_otp_code.sql:86`) but has no caller.
- **Impact (estimate).** `refresh_token`: a user with 4 cards who opens the app 3×/day inserts ≥12 rows/day (the home screen mints a brand token per card on every open, `home.tsx:52-60`). 50 k users → ~600 k rows/day, ~220 M rows/year, each row also costing a `RefreshToken.personId` FK check. `idempotency_key`: 1 row per earn, 2 per POS redemption, 1 per bonus, 1 per settlement → ~1.3× sales volume; 20 k sales/day ⇒ ~10 M rows/year with a JSON `response` column. `outbox`: 1–2 rows per sale, same order. `terminal.service.ts:339-348` (`createReceipt`) scans `outbox` by `brand_id` + `eventType` + `createdAt` with only `(brand_id)` and `(published_at)` indexes, so every receipt POST gets slower as the brand's outbox grows.
- **Scenario.** Month 6: `refresh_token` is the largest table in the database, `wallet_sessions(person_id)` (which lists live sessions for the Security screen) scans thousands of revoked rows per person, and `storeRefresh` inserts contend on the `token_hash` unique index.
- **Fix.** (1) `brandTokenForWallet` should return only an access token (the client never uses the refresh token it is given) — removes the write entirely; (2) nightly purge job (leader-locked): `DELETE FROM refresh_token WHERE revoked_at < now() - interval '7 days' OR expires_at < now()`, `DELETE FROM outbox WHERE published_at < now() - interval '14 days'`, `DELETE FROM webhook_delivery WHERE status IN ('delivered','dead') AND created_at < now() - interval '30 days'`, `DELETE FROM idempotency_key WHERE created_at < now() - interval '48 hours'` (the terminal replays within hours, not weeks; keep `journal.idempotency_key_id` nullable, which it already is), call `otp_prune()`; (3) partial index `outbox (brand_id, created_at) WHERE published_at IS NULL` and `outbox (brand_id, event_type, created_at DESC)` for the receipt celebration lookup.
- **Effort:** S

### PERF-08 — Apple pass generation is ~0.3–0.6 CPU-s per fetch on a shared vCPU and is triggered per sale by the push relay
- **Severity:** High  **Confidence:** Likely (CPU estimate; code path confirmed)
- **Location:** `apps/api/src/modules/wallet-pass/passkit.service.ts:111-136` (`latestPass` → `buildPassData` → `imagesFor` → `apple.issue`); `stamp-strip.ts:76-84` (`rasterise`: three `sharp(...).resize(...).png().toBuffer()` at 1×/2×/3× = 375×123, 750×246, 1125×369 from SVG); `apple-wallet.service.ts:258-306` (`sign()` re-decodes the base64 `.p12`, runs `forge.pkcs12.pkcs12FromAsn1` with password-based decryption and builds a PKCS#7 RSA signature in pure JS **on every issue**); `jszip` DEFLATE `:254`; trigger chain `txn-alert.service.ts:86-90` → `wallet-pass.service.ts:131` → `passkit.notifyPassChanged` → APNs → device GETs `/v1/passes/:type/:serial` (`passkit-web.controller.ts:104-121`, `@SkipThrottle()`).
- **Evidence.** Nothing caches the parsed key/cert, the rendered strip images (deterministic per brand colour + balance/stamp state), or the built `.pkpass`. `If-Modified-Since` short-circuits only when `pass_state.updated_at` has not moved (`:119-127`), and `pass_touch_and_devices` moves it on every sale.
- **Impact (estimate).** libvips SVG rasterisation ×3 ≈ 60–150 ms, p12 parse + RSA-2048 sign in `node-forge` ≈ 100–300 ms, zip ≈ 10 ms ⇒ 0.2–0.5 s CPU per pass on a modern core, ~2× on a shared `basic-xs` vCPU. If 20 % of 20 rps burst sales belong to Apple-pass holders, that is ~4 pass builds/s ≈ 1.5–4 CPU-s per second — more than the container has — and it lands on the *API* containers because the device's GET goes through the load balancer. The event loop stalls during `node-forge` work (synchronous), so till requests on that container queue behind pass signing.
- **Scenario.** Lunch rush at a brand that pushed "Add to Apple Wallet" in a campaign: every sale triggers a push, every push a rebuild; p95 on `/terminal/transactions` on the affected container climbs with the number of Apple-wallet customers served.
- **Fix.** (1) Parse the p12 once at boot (`onModuleInit`) and keep `{ key, leaf, wwdr }`; (2) memoise `pointsStrip`/`stampStrip` output by `(color, balanceString | collected/target/icon/headline)` in an LRU (≤ 500 entries ≈ 50 MB max — size the cap to memory); (3) cache the final `.pkpass` bytes by `(serial, pass_state.updated_at)` for 10 minutes so a device that fetches twice after one push (iOS often does) gets the cached bundle; (4) consider `apns-priority: 5` coalescing: only touch `pass_state`/push once per membership per 60 s window; (5) `@SkipThrottle()` on the pass controller is correct for Apple but add a per-serial token bucket (e.g. 6/min) in-process.
- **Effort:** M

### PERF-09 — Settlement job: unindexed scan per group per minute on every instance, no row claiming
- **Severity:** High  **Confidence:** Confirmed (index inventory) / estimate (cost)
- **Location:** `apps/api/src/modules/workers/settlement.service.ts:19-28`:
  ```ts
  tx.terminalTransaction.findMany({ where: { groupId: ctx.groupId!, intent: 'redeem', state: 'captured', settledAt: null }, select: { id: true }, take: 200 })
  ```
  then `settleOne` per id `:44-75` (findUnique + `costRule.findFirst` + `groupWallet.findUnique` + `drawdownWallet` ≈ 10 round trips). Indexes on `terminal_transaction`: `(brand_id)`, `(membership_id)`, unique `(actor_id, idempotency_key)` (`schema.prisma:1133-1135`) — **no `group_id`, `state` or `settled_at` index**. Scheduled every 60 s per group on all three containers (`worker-runner.service.ts:57-58`).
- **Evidence.** With no index containing `group_id`, the query is a sequential scan of `terminal_transaction` (all brands, all time) filtered on four columns, once per group per minute per instance. The three instances read the same 200 ids; `settleOne` is idempotent via the `settle:<id>` idempotency key (`:67`) and the `settledAt`/state re-check, but the losers fail with a unique violation on `(actor_id, key)` (`engine.ts:292`) which is caught and logged as `settlement failed for …` (`:36-39`) — noise that masks real failures.
- **Impact (estimate).** 1 M `terminal_transaction` rows ≈ 300 MB heap: a seq scan ≈ 0.3–1 s on shared compute; 20 groups × 3 instances ≈ 60 scans/minute ≈ 20–60 % of one Postgres core permanently. The 200/min ceiling per group is 3.3 redemptions/s per group — adequate — but the three instances fight for the same rows so effective throughput is ~1 instance's worth with 3× the load.
- **Scenario.** The dashboard shows settlement "working" (it is) while `pg_stat_statements` shows `SELECT id FROM terminal_transaction WHERE group_id = … AND settled_at IS NULL` as the top query by total time.
- **Fix.** `CREATE INDEX terminal_transaction_unsettled_idx ON terminal_transaction (group_id, created_at) WHERE intent = 'redeem' AND state = 'captured' AND settled_at IS NULL;` (partial — stays tiny), claim with `UPDATE … SET settling_at = now() WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING id` or take the leader lock from PERF-01; read `costRule` and `groupWallet` once per group, not per transaction.
- **Effort:** S

### PERF-10 — Mobile home screen fans out to 2 requests per card (one of them a DB write) on every open; campaign bursts multiply it
- **Severity:** High  **Confidence:** Confirmed
- **Location:** `apps/mobile/app/(tabs)/home.tsx:39-62` (`getCards`, `getProfile`, `getActivity(40)`, `getVouchers`, then `getCards()` again and `Promise.all(list.map(card => getChallenges(card.brandId)))`); `apps/mobile/lib/api.ts:140-160` (`brandToken` → `POST /customer/wallet/cards/:brandId/token` whenever the in-memory cache is cold, which is every launch); server side `auth.service.ts:234-255` (membership lookup + `refreshToken.create`), `gamification.service.ts:274-357` (`memberChallenges`: 4 queries + `set_config`s), `loyalty.service.ts:68-77` (`resolveCustomerMembership`: its own transaction before every `/customer/*` call); `useTillWatch.ts:18, 76-82` (polls `GET /customer/wallet/activity?limit=10` every 4 s for up to 10 min while the scan screen is focused).
- **Evidence.** Per app open with *n* cards: 5 wallet GETs (`wallet_cards`, `wallet_profile`, `wallet_activity` + `wallet_vouchers`, `wallet_vouchers` again, `wallet_cards` again) + *n* × (`POST …/token` + `GET /customer/challenges`), the latter being 2 transactions (`resolveCustomerMembership`, then `memberChallenges`). With n = 4: **13 HTTP requests, ~35 DB round trips, 4 `refresh_token` inserts** per open. `useAsync` (`apps/mobile/lib/useAsync.ts:21-24`) deliberately has no cache, so switching tabs and returning re-fetches.
- **Impact (estimate).** Campaign push to 50 k → 10 k opens in the first 10 minutes ≈ 17 opens/s ≈ 220 rps API, ~600 DB queries/s, ~70 inserts/s, split across two containers with ~3 pooled connections each. The `wallet_cards` seq-scan cost from PERF-03 multiplies this. p95 target of 500 ms is not reachable; the honest estimate is 2–5 s p95 with a tail of `P2024` 500s.
- **Scenario.** Brand sends "double points this weekend" to 50 k WhatsApp opt-ins at 18:00 Thursday. App opens spike; `/customer/wallet/cards` and `/token` dominate; tills at that brand see slower earns because they share the same two containers and the same pool.
- **Fix.** (1) Server: one aggregated `GET /customer/wallet/home` (cards + vouchers + top activity + stamp cards across brands via one definer function); the stamp-card strip in particular should come from a `wallet_stamp_cards(p_person_id)` SQL function rather than per-brand tokens; (2) stop writing `refresh_token` on brand-token mint (PERF-07); (3) client: cache brand tokens in AsyncStorage with their expiry so a relaunch within 15 min does not re-mint; cache the last home payload and render it immediately (stale-while-revalidate); (4) `useTillWatch`: back off to 8 s after the first minute, and stop when the app is backgrounded (it already stops on blur via `useFocusEffect`).
- **Effort:** M

### PERF-11 — Webhook delivery: no row claiming (3× duplicate deliveries), merchant endpoint hangs stall every brand, N+1 in relay, and the alert relay steals the rows first
- **Severity:** High  **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/workers/webhook.service.ts:153-182` (`relayOutbox`: `where: { brandId, publishedAt: null }` with `webhookEndpoint.findMany` **inside** the per-row loop at `:162`), `:185-224` (`deliverPending`: `findMany … status in [pending, failed], attempts < 6, take 100` with no lock/claim, then `await this.fetchImpl(d.endpoint.url, …)` with no timeout at `:202`); `claim_txn_alerts` (`2026-08-03_claim_alerts_settled.sql:23-34`) sets `published_at = now()` on `aggregate = 'points'` rows; `WEBHOOK_EVENT_TYPES` (`:12-17`) advertises `earn`, `redeem.captured` etc.
- **Evidence.** (a) Three instances each read the same ≤100 pending deliveries and POST them; a merchant endpoint that returns 200 gets the same event 1–3 times (the `X-Loyalty-Event-Id` lets a careful merchant dedupe; most will not). (b) One slow/hanging merchant URL blocks `deliverPending` for that brand indefinitely (undici default: no overall timeout), `perBrand` is sequential (`worker-runner.service.ts:96-101`), so every brand after it in the list gets no webhooks until the hung request completes, and the `busy` guard keeps it that way across ticks. (c) `relayOutbox` runs `webhookEndpoint.findMany` once per outbox row: 200 rows ⇒ 200 identical queries per tick. (d) Because the 15 s alert relay marks `points.*` outbox rows `published_at` before the 30 s webhook relay sees them, merchants subscribed to earn/redeem events receive almost none — a correctness bug surfaced by this audit's queue analysis; it also means the outbox has two consumers sharing one "consumed" flag. (e) "retried with backoff" (`:21`) is not implemented: a failed delivery is retried on the very next 30 s tick, 6 times, then dead — ~3 minutes total before dead-letter, far too short for a merchant deploy window.
- **Impact.** Duplicate webhooks to merchants (support cost), stalled webhooks for all brands behind one bad URL, and no webhooks at all for the event types merchants care most about.
- **Fix.** Separate consumers: give `outbox` a per-consumer cursor (`alerted_at`, `webhooked_at`) or a `consumer` column on a `outbox_consumption` table; claim deliveries with `FOR UPDATE SKIP LOCKED` and a `next_attempt_at` with exponential backoff (30 s, 2 m, 10 m, 1 h, 6 h, 24 h); `AbortSignal.timeout(10_000)` on delivery; deliver per brand with concurrency 4; hoist the endpoint lookup out of the loop; add `webhook_delivery (status, next_attempt_at) WHERE status IN ('pending','failed')`.
- **Effort:** M

### PERF-12 — All five background jobs run on all three containers, including the `jobs` worker that was meant to be the only runner; ticks are aligned and un-jittered
- **Severity:** Medium  **Confidence:** Confirmed
- **Location:** `worker-runner.service.ts:44-71` (gates: `SKIP_DB`, `NODE_ENV=test`, `WORKERS_ENABLED=false` only — `ROLE` is not consulted); `main.ts:29-36` (`ROLE=worker` only skips migrations; the worker still boots the full HTTP app and `WorkerRunner`); `.do/app.yaml:56-77`; `perBrand` `:91-102` issues `brand.findMany` + per-brand `tenants.run` transactions every tick regardless of work.
- **Evidence/Impact (estimate).** Webhooks every 30 s: per brand 2 transactions × (2 `set_config` + 1 query) ≈ 6 round trips; 200 brands ⇒ 1,200 round trips / 30 s / instance ≈ 120 queries/s across three containers of pure polling against an idle table. Expiry hourly per brand: see PERF-02. All intervals start at process boot, so three containers deployed together tick together; combined with no claiming (PERF-01, PERF-09, PERF-11) this maximises collisions.
- **Fix.** Set `WORKERS_ENABLED=false` on the `api` service in `.do/app.yaml` and leave the `jobs` worker as the single runner (S, today); keep `WORKERS_ENABLED=true` only there. For resilience later, replace with a Postgres advisory-lock leader (`pg_try_advisory_lock`) so any container can take over. Add ±10 % jitter to `every()`. Replace per-brand polling with a single cross-brand claim (the alert relay already does this via a definer function).
- **Effort:** S

### PERF-13 — Terminal `/config` and `/app-version` are fetched on every return to the idle screen and each costs two transactions; `app-status` is uncacheable
- **Severity:** Medium  **Confidence:** Confirmed
- **Location:** `apps/terminal-android/.../ui/HomeScreen.kt:67-77` (`LaunchedEffect(Unit)` → `ping()`, `outbox.replayAll()`, `fetchConfig()`, `updater.check()` every time the composable enters); `CheckoutViewModel.kt:121-137` (`fetchConfig()` on init and `refreshServerConfig()`); `TerminalApi.kt:155-164` (`ping()` = signed `GET /transactions/0000…` → full HMAC guard + `authDb.apiKey.findUnique` + a `terminalTransaction.findFirst`); server `terminal.service.ts:147-168` (`config`: `getRedemptionConfig` in its own `tenants.run` + a second `tenants.run` for brand + terminal), `:181-210` (`appVersion`: `terminal.updateMany` in one tx + `terminal_current_release` in another); `app-status.controller.ts:19-31` (env-only, no DB, **no `Cache-Control`**).
- **Impact (estimate).** Per sale cycle a till does: ping (1 tx), config ×1–2 (2 tx each), app-version (2 tx), plus the sale itself. That is ~7 extra transactions ≈ 20 extra round trips per sale, roughly doubling the DB chatter of the terminal surface; at 200 tills × 1 sale/min that is ~25 extra queries/s steady. `app-status` is called on every app launch; with no `Cache-Control` the DO edge cannot absorb the campaign-burst spike.
- **Fix.** Server: serve `/terminal/config` from an in-process 60 s cache keyed by `brandId` (invalidate on `setBrandRedemptionConfig`/`updateSettings`) and fold `terminal.updateMany` into a fire-and-forget batched upsert; add `ETag`. Client: fetch config on boot and after a 403/`configVersion` change, not per idle screen; check `app-version` at most hourly. `app-status`: `Cache-Control: public, max-age=60`.
- **Effort:** S

### PERF-14 — Public e-receipt page and PDF are unauthenticated, do two writes per view, and render a PDF per request
- **Severity:** Medium (DoS vector reachable unauthenticated — CVSS-style: AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L ≈ 5.3)  **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/terminal-gateway/receipt-public.controller.ts:21-44` (`view`: `receipt.findUnique`, `receipt.updateMany`, `receipt.update` with `viewCount: { increment: 1 }`, `ereceipt_brand()` — 4 statements, 2 of them writes, per GET), `:47-113` (`pdf`: `pdfkit` document per request, no cache); throttle: default 300/min/IP (`app.module.ts:41-43`), per instance.
- **Impact (estimate).** A single IP can drive 600 req/min across two instances; each `/r/:token/pdf` is ~20–40 ms CPU on the shared vCPU and holds a pooled connection for the two queries; `/r/:token` writes twice. Tokens are unguessable, so the attacker needs real tokens (printed on receipts) — but one token suffices: 600 PDF renders/min ≈ 20–40 % of a core, and the two row updates per view serialise on that receipt's row.
- **Fix.** Cache the rendered PDF bytes per token for 1 h (receipts are immutable); throttle `/r/*` at 20/min/IP; count views with a single `UPDATE … SET view_count = view_count + 1, first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now()` (one write, not two); send `Cache-Control: private, max-age=300` on the HTML.
- **Effort:** S

### PERF-15 — HTTP server keep-alive/headers timeouts left at Node defaults behind a load balancer
- **Severity:** Medium  **Confidence:** Needs verification (DO LB idle timeout not in repo)
- **Location:** `apps/api/src/main.ts:73-74` (`await app.listen(port)` — no `server.keepAliveTimeout`, `server.headersTimeout`, `server.requestTimeout`)
- **Evidence.** Node 22 defaults: `keepAliveTimeout` 5 s, `headersTimeout` 60 s. A load balancer with an idle timeout longer than 5 s (DigitalOcean App Platform's is longer) will occasionally reuse a keep-alive connection the API has just closed, producing intermittent 502s that scale with request rate.
- **Fix.** After `listen`: `const s = app.getHttpServer(); s.keepAliveTimeout = 65_000; s.headersTimeout = 66_000;` and `s.requestTimeout = 30_000` for slow clients.
- **Effort:** S

### PERF-16 — Missing indexes on hot predicates (beyond PERF-03/09)
- **Severity:** Medium  **Confidence:** Confirmed (inventory) / Likely (plan)
- **Location:** `packages/db/prisma/schema.prisma` and `packages/db/prisma/sql/0001_baseline.sql:1195-1336`
- **Evidence.** `journal`: no `(brand_id, occurred_at)` — used by `pointsTrend`, `pointsByType`, `runDailyRollup`, and every "recent activity" ORDER BY (`loyalty.service.ts:124-131, 653-663`, `superadmin.service.ts:590-600`, `wallet_activity`). `entry`: no `(account_id, direction, expiry_bucket)` — `expiring()` (`loyalty.service.ts:162-167`) groups all credit entries of an account per call; `liabilityAging`. `outbox`: `(published_at)` only — `createReceipt` celebration lookup (`terminal.service.ts:339-348`) needs `(brand_id, event_type, created_at)`. `webhook_delivery`: `(status)` alone — `deliverPending` filters `brand_id + status + attempts`. `refresh_token`: no `(person_id, revoked_at)`/`(expires_at)` for `wallet_sessions` and the (missing) purge. `voucher`: `(brand_id)`, `(membership_id)` — the hold/confirm `updateMany`s filter `brand_id + membership_id + status + reserved_at` (`terminal.service.ts:86-112`), fine via `membership_id`. `receipt`: `(brand_id, created_at)` covers `txn_alert_context`.
- **Fix.** One migration: `journal (brand_id, occurred_at DESC)`, `entry (account_id, expiry_bucket) WHERE direction = 'credit'`, `outbox (brand_id, event_type, created_at DESC)`, `outbox (brand_id, created_at) WHERE published_at IS NULL`, `webhook_delivery (brand_id, status) WHERE status IN ('pending','failed')`, `refresh_token (person_id) WHERE revoked_at IS NULL`, `refresh_token (expires_at)`. Verify each with `EXPLAIN (ANALYZE, BUFFERS)` on the seeded local DB before and after.
- **Effort:** S

### PERF-17 — `useTillWatch` polls the cross-brand activity feed every 4 s per scanning customer
- **Severity:** Medium  **Confidence:** Confirmed
- **Location:** `apps/mobile/lib/useTillWatch.ts:18-21, 46-82`; server `wallet.service.ts:70-101` (`wallet_activity` + `wallet_vouchers` per call), `2026-07-28_customer_wallet.sql:102-126` (`wallet_activity` joins `entry → journal → ledger_account → customer_membership` for the person and sorts by `occurred_at` with no supporting index on `journal.occurred_at`).
- **Impact (estimate).** 50 customers holding up their code at the same time ⇒ 12.5 rps ⇒ 25 definer calls/s, each scanning all entries of the person's accounts (hundreds of rows) and all their vouchers. Tolerable alone; stacks on PERF-10 during a campaign.
- **Fix.** Poll `GET /customer/wallet/activity?limit=3&since=<baseline ts>` (add `p_since` to `wallet_activity`), back off 4 s → 8 s after 60 s, and prefer a push (the app already registers push tokens, `wallet.controller.ts:94-98`).
- **Effort:** S

### PERF-18 — `createReceipt` scans the brand's outbox on every receipt and the table never shrinks
- **Severity:** Medium  **Confidence:** Confirmed
- **Location:** `terminal.service.ts:337-357` (`outbox.findMany({ where: { brandId, eventType: 'points.challenge_completed', createdAt: { gte: now-15min } }, orderBy: { createdAt: 'desc' }, take: 20 })`) with only `outbox (brand_id)` and `(published_at)` indexes.
- **Impact.** Index scan on `brand_id` returns every outbox row the brand ever produced (PERF-07: never purged), heap-filtered on `event_type` and `created_at`; cost grows linearly with brand lifetime. At 1 M outbox rows for a busy brand ≈ tens of ms per receipt POST, on the hottest write path.
- **Fix.** Index from PERF-16 plus purge from PERF-07; or carry `completed` on the transaction response into the receipt DTO from the till (the code comment says the fleet build cannot yet — keep the fallback but index it).
- **Effort:** S

### PERF-19 — Superadmin `listCustomers`/`search` use leading-wildcard ILIKE across the platform
- **Severity:** Medium  **Confidence:** Confirmed
- **Location:** `superadmin.service.ts:471-500` (`fullName contains insensitive` OR `memberships.some.loyaltyId contains`), `:1043-1056` (`search`: three parallel ILIKEs, `take: 8`)
- **Impact.** `person` and `customer_membership` seq scans per keystroke-driven search; with 500 k persons ≈ 100–300 ms per query, three in parallel, from an admin UI that fires on typing. Not customer-facing; competes with till traffic for the pool.
- **Fix.** `pg_trgm` GIN on `person (lower(full_name))` and `customer_membership (lower(loyalty_id))`; debounce the console; phone search already goes by hash (good).
- **Effort:** S

### PERF-20 — Prisma transaction and Postgres statement timeouts are unconfigured everywhere, so every slow path becomes a 500 and every long job silently aborts
- **Severity:** Medium (root cause behind PERF-02/05)  **Confidence:** Confirmed
- **Location:** `tenant.service.ts:22`; no `statement_timeout`/`lock_timeout`/`idle_in_transaction_session_timeout` anywhere in `apps/api/src`, `packages/db/prisma/sql`, `.env.example`
- **Evidence.** Interactive-transaction defaults `maxWait: 2000, timeout: 5000`. Request paths that lock a member's `account_balance` row (earn/capture on the same customer from two tills, or a till retry overlapping its own first attempt) wait on the row lock *inside* the 5 s budget; the loser gets `P2028` → `AllExceptionsFilter` → 500 → the till enqueues the earn to its outbox and replays it later (`CheckoutViewModel.kt:401-409`) — correct via idempotency (`terminal.service.ts:644-647`, `engine.ts:279-305`) but visible to the cashier as "Earn queued". Jobs get the same 5 s budget as requests.
- **Fix.** `TenantService.run(ctx, work, { timeout })` with a per-caller budget: 10 s for requests, 120 s for jobs; `ALTER ROLE loyalty_app SET statement_timeout = '8s'`, `SET lock_timeout = '3s'`, `SET idle_in_transaction_session_timeout = '15s'`; map `P2028`/`P2024` to 503 with `Retry-After` so the till distinguishes "retry now" from "broken".
- **Effort:** S

### PERF-21 — `/terminal/transactions/batch` processes up to 200 operations sequentially inside one HTTP request; the first-party terminal does not use it
- **Severity:** Medium  **Confidence:** Confirmed
- **Location:** `terminal.service.ts:829-840` (`for (const op of ops) await this.transaction(ctx, op)` — each op in its own transaction, good), `dto.ts:175-182` (`@ArrayMaxSize(200)`), client timeout `TerminalApi.kt:28` (`readTimeout(15, SECONDS)`); no caller of `/transactions/batch` in `apps/terminal-android` (grep) — `OfflineOutbox.replayAll()` (`OfflineOutbox.kt:54-89`) replays one op at a time via `/members/resolve` + `/transactions`.
- **Impact (estimate).** 200 ops × 60–100 ms (PERF-03 included) ≈ 12–20 s > the 15 s client read timeout: a third-party POS using the documented batch endpoint would time out, retry, and (safely, thanks to idempotency) re-run the same batch, doubling server work while never seeing a result. Lock duration is fine (per-op transactions); partial failure semantics are fine (per-op `ok/error`).
- **Fix.** Cap batch at 50 or process with a time budget (stop after 8 s, return `processed`/`remaining`); document the client timeout requirement in `docs/pos-integration-api.md`. The Android replay should resolve once per identifier and reuse the member token rather than resolving per op.
- **Effort:** S

### PERF-22 — Audit hash chain: "previous row" lookup per write and chain forks under concurrency
- **Severity:** Low  **Confidence:** Confirmed
- **Location:** `apps/api/src/platform-core/audit/audit.service.ts:27` (`tx.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { hash: true } })` — no `where`; RLS supplies the tenant filter)
- **Evidence/Impact.** Uses `audit_log_created_at_idx` and walks newest-first until a row passes the RLS policy; for a quiet brand on a busy platform that is a long walk. Two concurrent writers in the same scope read the same `prev` and both chain to it (fork), which defeats tamper-evidence without affecting performance. Only on admin mutation paths, so volume is low.
- **Fix.** `where: { brandId }`/`platformId` explicitly + index `(brand_id, created_at DESC)`; `SELECT … FOR UPDATE` on a per-scope `audit_head` row to serialise the chain.
- **Effort:** S

### PERF-23 — In-memory nonce store is O(n) per request and the throttler is per instance
- **Severity:** Low  **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/nonce-store.service.ts:13-23` (`gc()` iterates the whole `Map` on every `checkAndRemember`); `app.module.ts:41-43`
- **Impact (estimate).** n ≈ rps × 300 s skew ≈ 6,000 entries at 20 rps ⇒ ~6,000 map iterations per terminal request ≈ 0.1–0.3 ms; negligible. Rate limits are effectively ×2 across the two API containers (OTP 5/min → 10/min per IP) — a cost/security point rather than a performance one.
- **Fix.** Sweep every 30 s on a timer instead of per call; move both to Redis when it is wired up.
- **Effort:** S

### PERF-24 — Earn rules and campaigns are loaded and zod-parsed per receipt and per quote
- **Severity:** Low  **Confidence:** Confirmed
- **Location:** `loyalty.service.ts:234-251` and `terminal.service.ts:599-604` (`loyaltyEarnRule.findMany` + `EarnRule.parse` per row + `campaigns.activeRules` `findMany`), `packages/shared/src/rules.ts`
- **Impact.** Two queries and ~0.1 ms of parsing per rule per call; a brand has a handful of rules. The `matches` operator compiles a `RegExp` per evaluation (`rules.ts:95-103`, bounded to 200 chars — good).
- **Fix.** 30 s in-process cache keyed by `brandId`, invalidated on rule/campaign writes.
- **Effort:** S

### PERF-25 — `pgbouncer=true` disables prepared statements, so every query is planned from scratch
- **Severity:** Info  **Confidence:** Confirmed
- **Location:** `.env.example:7, 11`
- **Evidence.** Required for Supavisor transaction mode; the cost is Postgres CPU per query, which this codebase's many-small-queries style (2–4 `set_config` + N statements per request) amplifies. Supavisor transaction mode itself does not support protocol-level prepared statements either, so there is no quick fix; it is a reason to reduce round trips (definer functions, `upsert`, batched writes).
- **Effort:** n/a

### PERF-26 — `app-status` and analytics GETs carry no `Cache-Control`
- **Severity:** Info  **Confidence:** Confirmed
- **Location:** `app-status.controller.ts:19-31`; `reporting.controller.ts`; only `brand-asset.controller.ts:19` sets caching headers (correctly, `immutable`).
- **Fix.** See PERF-13 and PERF-05.

### PERF-27 — Argon2 parameters are library defaults; login-only, acceptable
- **Severity:** Info  **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/crypto/password.service.ts:7-9` (`@node-rs/argon2` `hash(plain)` defaults: Argon2id, m≈19 MiB, t=2, p=1)
- **Impact.** ~50–100 ms CPU and 19 MB per verify on admin login/MFA only (`auth.service.ts:51-61`); customer OTP verify is SHA-256 in SQL (`otp_code.sql:62-83`) and cheap. Ten concurrent admin logins on a 512 MB container is ~200 MB transient — fine; worth knowing before lowering memory.

### PERF-28 — `listMembers` sorts on a computed column with OFFSET pagination
- **Severity:** Low  **Confidence:** Confirmed
- **Location:** `loyalty.service.ts:510-545` (`ORDER BY available/lifetime … LIMIT/OFFSET` over a `customer_membership ⋈ ledger_account ⋈ account_balance` join, plus a `count(*)` per page)
- **Impact (estimate).** Full sort of the brand's members per page (50 k rows ≈ 50–150 ms) and deep offsets re-sort. Acceptable for an admin table now; becomes the slowest console page at 200 k members.
- **Fix.** Keyset pagination on `(available, m.id)`; cache the total for 60 s.
- **Effort:** S

---

## Load-test plan (k6)

**Environment.** Correctness scenarios (b, e-correctness, duplicate-earn SQL checks) run against the local embedded Postgres (`pnpm db:dev`, `pnpm db:seed`) with the API started with `WORKERS_ENABLED=true` on two ports (`API_PORT=3001` and `3002`, same DB) to reproduce the multi-instance hazards. Timing scenarios need a staging stack shaped like production: a Supabase project on the same compute tier as prod (not the free tier), two `basic-xs` containers behind the DO load balancer, Twilio/Resend/APNs/Google pointed at sandboxes or a local stub (`SMS_PROVIDER=http`, `SMS_HTTP_URL=http://stub`). Never run any of this against `api.partnerspoints.ae`. Enable `pg_stat_statements` on the staging DB and reset it before each scenario.

**Shared setup.**
- Seed: 5 brands, 200 terminals with issued HMAC keys (`POST /v1/admin/terminals/:id/keys`), 50 k persons/memberships, 2 M `entry` rows via a SQL generator (not the API) with `expiry_bucket` spread over 18 months, 20 % of memberships with a `pass_registration`.
- HMAC signing in k6: port `packages/sdk-terminal` canonical string (method, path, ts, nonce, body hash) into a k6 `lib/hmac.js` using `k6/crypto` `hmac('sha256', secret, canonical, 'hex')`; keys and secrets loaded from a CSV produced by the seed script.
- Metrics captured for every scenario: k6 `http_req_duration{scenario}` p50/p95/p99, `http_req_failed`, `checks`; `/metrics` `rssBytes`/`heapUsedBytes` sampled every 10 s per container (`GET /metrics`); Postgres: `pg_stat_statements` top-20 by `total_exec_time` and `mean_exec_time`, `pg_stat_activity` counts by `state`/`wait_event_type` sampled every 5 s (`SELECT wait_event_type, count(*) FROM pg_stat_activity GROUP BY 1`), `pg_locks` with `granted = false`; Supavisor pool wait from the Supabase dashboard ("Pooler → waiting clients"), and API logs grepped for `P2024|P2028|too many connections`.

**(a) Till receipt storm.** 200 VUs, constant-arrival-rate 20 rps for 10 min; each iteration: `POST /v1/terminal/members/resolve` (phone) → `POST /v1/terminal/transactions` (`intent: earn`, fresh `idempotencyKey`) → `POST /v1/terminal/receipts`. 5 % of iterations re-send the same `transactions` body with the same key after 500 ms (simulated till retry). Thresholds: `http_req_duration{name:transactions}` p95 < 300 ms, `http_req_failed` < 0.1 %. SQL assertions after the run:
```sql
-- exactly one journal per idempotency key
SELECT count(*) FROM (SELECT ik.id FROM idempotency_key ik JOIN journal j ON j.idempotency_key_id = ik.id GROUP BY ik.id HAVING count(*) > 1) d;  -- expect 0
-- every earn's balance matches its entries
SELECT count(*) FROM account_balance ab WHERE ab.posted_credits <> (SELECT coalesce(sum(amount_minor),0) FROM entry e WHERE e.account_id = ab.account_id AND e.direction='credit');  -- expect 0
-- retries produced one terminal_transaction each
SELECT count(*) FROM (SELECT actor_id, idempotency_key, count(*) c FROM terminal_transaction GROUP BY 1,2 HAVING count(*) > 1) d;  -- expect 0
```
Expected before fixes: p95 blows past 300 ms once PERF-03 scans dominate; watch `pg_stat_statements` for `SELECT … FROM ledger_account WHERE …` at the top.

**(b) Redemption authorize/capture race.** 50 VUs, one shared customer with exactly 1,000 available points, each VU loops: `POST /transactions` (`intent: redeem`, `points: 100`, unique key) → on 200 `POST /transactions/:id/capture`, 1 in 5 instead `POST …/void`. Run 60 s. Assertions: no response with status 500; SQL:
```sql
SELECT posted_credits - posted_debits - pending_debits FROM account_balance WHERE account_id = $acct;  -- >= 0 always (also check account_balance_non_negative never fired in logs)
SELECT count(*) FROM terminal_transaction WHERE membership_id = $m AND state = 'captured';  -- <= 10 (1000/100)
SELECT count(*) FROM journal WHERE kind = 'redeem_capture' AND brand_id = $b;  -- equals captured count exactly
```
Expected: correctness holds (single-row guarded updates); observe lock waits in `pg_locks` and `P2028` once contention exceeds 5 s (PERF-20).

**(c) Campaign burst.** 2,000 VUs ramping 0→100 rps over 2 min then 100 rps for 8 min; per iteration `POST /v1/customer/auth/wallet` is pre-done (tokens from a CSV); hit `GET /customer/wallet/cards`, `GET /customer/wallet/offers`, `GET /customer/wallet/activity?limit=40`, then for each card `POST /customer/wallet/cards/:brandId/token` + `GET /customer/challenges` (reproduces `home.tsx`). Thresholds: p95 < 500 ms, `http_req_failed` < 0.1 %. SQL during run: `SELECT count(*) FROM refresh_token` every minute (growth rate = PERF-07 evidence); `pg_stat_statements` for `wallet_cards`. Expected before fixes: p95 1–5 s, pool waits visible, `P2024` in logs.

**(d) OTP abuse.** 50 rps `POST /v1/customer/auth/otp` from 3 source IPs for 2 min with `SMS_PROVIDER=http` and a stub that counts calls. Assert: per IP ≥ 90 % of responses are 429 after the first 5 in each minute; stub call count ≤ 5 × IPs × minutes × instances (expect ×2 because the throttler is per instance — PERF-23); `otp_issue` DB-side cap also holds per phone (≤ 5 per 15 min, `otp_code.sql:33-40`). Also run 10 rps on `/verify` with wrong codes and confirm `attempts` caps at 5 per phone.

**(e) Month-end expiry sweep.** Seed 5 M `entry` rows across 5 brands with 10 % in past buckets. Start two API processes against the same DB with `WORKERS_ENABLED=true` and a test hook that triggers `sweepBrand` immediately on both (or set the interval env to 10 s if one is added). Concurrently run scenario (b) at 5 rps. Measure: wall time of the sweep per brand (API log), `pg_locks` `granted=false` durations on `account_balance` (`SELECT max(now() - query_start) FROM pg_stat_activity WHERE wait_event_type = 'Lock'`), and after completion:
```sql
-- double-expiry detector (PERF-01)
SELECT account_id, count(*) FROM entry e JOIN journal j ON j.id = e.journal_id WHERE j.kind = 'expiry' AND e.direction = 'debit' AND j.occurred_at > now() - interval '1 hour' GROUP BY 1 HAVING count(*) > 1;  -- expect 0 rows after fix; expect rows before
-- expired amount never exceeds expired lots
SELECT count(*) FROM (SELECT la.id, sum(e.amount_minor) FILTER (WHERE j.kind='expiry') ex, sum(e.amount_minor) FILTER (WHERE e.direction='credit' AND e.expiry_bucket < current_date) lots FROM ledger_account la JOIN entry e ON e.account_id = la.id JOIN journal j ON j.id = e.journal_id GROUP BY la.id HAVING sum(e.amount_minor) FILTER (WHERE j.kind='expiry') > sum(e.amount_minor) FILTER (WHERE e.direction='credit' AND e.expiry_bucket < current_date)) d;  -- expect 0
```
Thresholds: wall time < 10 min for all brands, no lock wait > 1 s on redemptions, zero `P2028` in logs. Expected before fixes: `P2028` on the large brands (sweep never commits) and duplicate expiry rows on the small ones.

**(f) Soak.** 2 h at 5 rps mixed: 60 % scenario (a) iterations, 20 % `GET /v1/r/:token` + `/pdf` (public), 10 % `GET /v1/passes/:type/:serial` with a valid `ApplePass` token (forces `sharp` + `node-forge`), 10 % wallet reads. Assert `rssBytes` slope over the last 90 min < 5 MB/10 min per container and `heapUsedBytes` returns to baseline after each 10-minute window; GC pauses via `--trace-gc` on one container. Expected hot spots: `node-forge` p12 parsing and libvips buffers (PERF-08), `pdfkit` (PERF-14).

---

## Not assessed
- Actual latencies and pool-wait numbers: the local DB was not started and no endpoint was timed; every figure above is an estimate from query shape, index inventory and round-trip counts.
- Supabase compute tier, Supavisor `pool_size`/`max_client_conn`, Postgres `max_connections`, and whether `statement_timeout` is set on the `loyalty_app` role (none of this is in the repo).
- DigitalOcean load-balancer idle timeout and whether the `basic-xs` container reports 1 CPU to Prisma's pool sizer.
- Front-end bundle/render performance of the three Next.js consoles (out of scope; confirmed no `setInterval`/`refreshInterval` polling in `apps/web-brand` or `apps/web-superadmin`).
- Segments evaluation cost (`segments/segment.service.ts:195-197` runs a CTE over all brand members with a lateral tier lookup per preview) and coupon bulk generation (bounded at 10,000 via `createMany`, `coupon.service.ts:42-68`) — glanced, not analysed.
- Partnerships/Lulu conversion paths (stub connector).
- Behaviour of the dead BullMQ `WorkerScheduler` if `REDIS_URL` is ever set: it would enqueue repeatable jobs that nothing consumes (`worker-scheduler.ts:16-37`), harmless but misleading.

## Positive controls verified
- `claim_txn_alerts` and `sweep_account_deletions` use `FOR UPDATE SKIP LOCKED` (`2026-08-03_claim_alerts_settled.sql:32`, `2026-08-05_account_deletion.sql:104`) — these two jobs are genuinely multi-instance safe.
- Ledger balance mutations are single-row guarded `UPDATE … WHERE available >= X` (`engine.ts:128-134, 149-156, 249-255`); overdraw is impossible regardless of concurrency, and the DB `CHECK`/trigger backstops exist (`ledger.sql:31-70`).
- Terminal idempotency is checked before any work (`terminal.service.ts:644-647` on `(actor_id, idempotency_key)`), and the Android outbox replays with the original key (`OfflineOutbox.kt:64-70`), so till retries do not duplicate earns.
- `batch` runs one transaction per operation (`terminal.service.ts:829-840`) — no long-held locks.
- Every list endpoint caps `take` at ≤ 200 (`Math.min(query.limit ?? 50, 200)` pattern throughout; `BatchDto` `@ArrayMaxSize(200)`); the only large `take`s are the CSV exports (10,000) and partnerships reports (5,000), both admin-only.
- `wallet_cards`, `wallet_offers`, `wallet_pass_data`, `txn_alert_context` each do their fan-out in one SQL round trip rather than N.
- Apple pass `If-Modified-Since` short-circuit (`passkit.service.ts:119-127`), `204` for "nothing changed" (`passkit-web.controller.ts:86-89`), one APNs session per batch and a cached provider token (`apns.service.ts:49-71, 88-90`).
- Brand logo served with `Cache-Control: public, max-age=31536000, immutable` (`brand-asset.controller.ts:19`).
- OTP rate limiting lives in the database (`otp_issue`, per phone, survives restarts) in addition to the per-IP throttler; OTP verify is a cheap hash compare, not Argon2.
- Terminal HTTP client has explicit connect/read timeouts (`TerminalApi.kt:26-29`) and the capture path retries 3× with 1.2 s spacing before flagging for reconciliation (`CheckoutViewModel.kt:378-391`).
- Rules engine bounds regex length (`rules.ts:67, 97`) and is pure/synchronous.
- Receipt email is dispatched after the transaction body returns and never awaited into the till's response (`terminal.service.ts:398-416`); failures are swallowed.
- No polling loops in either web console; mobile `useTillWatch` stops on blur and after 10 minutes.
