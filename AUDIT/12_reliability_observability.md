# 12 — Reliability & Observability

Audit date: 2026-10-10. Branch `main` @ afc3fe2 plus uncommitted working tree. Read-only: no source edits, no production access. Deployment facts come from `.do/app.yaml`, `Dockerfile`, `docs/deployment.md`, `DEPLOYMENT.md`; runtime facts from `apps/api/src`, `apps/terminal-android`, `apps/mobile`. Local verification: `apps/api/test/schema-migrator.e2e.test.ts` run against embedded Postgres (result in §9).

Severity is by outage / data-loss impact. Confidence: Confirmed (read the code path end to end), Likely (code says so but depends on a runtime value not in the repo), Needs verification (depends on DO/Supabase dashboard state).

## 0. Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | SRE-01 |
| High | 11 | SRE-02 … SRE-12 |
| Medium | 9 | SRE-13 … SRE-21 |
| Low | 5 | SRE-22 … SRE-26 |
| Info | 2 | SRE-27, SRE-28 |

One-paragraph verdict: the API has the *shape* of an observable service (structured pino logs with request ids, `/health` `/ready` `/metrics`, a boot migrator with an advisory lock, a transactional outbox) but none of it is wired to anything that would wake a human. There are no counters, no alert rules, no log destination, no SLOs, no runbooks, no DR drill, no graceful shutdown, no outbound timeouts, and the only health probe in use is a liveness check that returns 200 with the database down. Several money-adjacent background jobs degrade to `logger.warn`. One deployed container (the `jobs` worker) actively destroys customer transaction alerts. Go-live without fixing SRE-01 through SRE-05 means the first sign of an incident will be a merchant phone call.

---

## 1. Findings

### SRE-01 — No metrics, no alerting, no log retention: the platform cannot detect its own outage
**Severity:** Critical  **Confidence:** Confirmed  **Effort:** M

**Location:** `.do/app.yaml` (whole file), `apps/api/src/platform-core/health/health.controller.ts:26-43`, `apps/api/package.json` deps.

**Evidence:**
- `.do/app.yaml` has no `alerts:` block at app or service level and no `log_destinations:` on either component (grep for both returns nothing).
- No metrics library: `grep -rn "prom-client|histogram|new Counter|opentelemetry|@sentry|datadog" apps/api/src apps/api/package.json` matches only a reporting-module SQL histogram and a comment in `health.controller.ts:29` that claims "Production scrapes a Prometheus exporter (prom-client) behind this" — there is no such exporter and no `prom-client` dependency.
- `/metrics` returns `{uptimeSeconds, rssBytes, heapUsedBytes, node, pid, ts}` (`health.controller.ts:33-42`) — process vitals only, JSON, not Prometheus exposition format, nothing scrapes it.
- Every money-affecting job failure is a log line and nothing else: `settlement.service.ts:37` `this.logger.warn(\`settlement failed for ${id}…\`)`; `worker-runner.service.ts:83,99,112` `this.logger.error(...)`; `txn-alert.service.ts:67`; `webhook.service.ts:217` writes `lastError` to a row.
- Logs go only to DO's built-in console (no forwarder). DO App Platform retains runtime logs for a short window (days, plan-dependent — Needs verification of the exact figure on the account) and offers no search across restarts.

**Impact:** A DB outage, a pooler saturation event, a Twilio rejection storm, a settlement wallet going negative, or a crash loop produce no page, no email, no dashboard delta. Post-incident reconstruction depends on the DB `audit_log` table, not on logs.

**Failure scenario:** Supavisor hits its connection ceiling at 19:30 on a Thursday. Every terminal request returns P2024/P2028 → 500. Tills queue earns offline (SRE-14) and refuse redemptions. Nobody at RFM knows until a merchant calls. The `/health` check keeps returning 200 (SRE-02) so DO does nothing either.

**Fix:**
1. Add `alerts:` to `.do/app.yaml` (exact rules in §4) and a `log_destinations:` entry (Papertrail/Logtail/Datadog/OpenSearch are the four DO supports) with ≥30 days retention.
2. Add `prom-client`, register a default registry, expose it at `/metrics` behind a bearer token or DO internal-only route, and emit the ten counters in §3.
3. Route a "worker failure" counter and the `/ready` probe into an external pager (Better Stack / PagerDuty / Opsgenie — DO alerts can only email/Slack).

---

### SRE-02 — Liveness-only health probe: 200 with the database down; `/ready` unused anywhere
**Severity:** High  **Confidence:** Confirmed  **Effort:** S

**Location:** `health.controller.ts:11-14` (`/health`), `:17-25` (`/ready`), `.do/app.yaml:19-20`, `Dockerfile:44`.

**Evidence:**
```ts
@Get('health') health() { return { status: 'ok', ts: new Date().toISOString() }; }   // no I/O
@Get('ready') async ready() { try { await this.prisma.$queryRaw`SELECT 1`; … } catch { throw new ServiceUnavailableException(...) } }
```
`.do/app.yaml`: `health_check: { http_path: /health }` — DO defaults apply (initial_delay 0s, period 10s, timeout 1s, failure_threshold 3, success_threshold 1).
`Dockerfile:44`: `HEALTHCHECK … fetch('http://localhost:3001/health')`. (DO App Platform ignores Dockerfile HEALTHCHECK — Needs verification — so this only matters for local `docker run`.)
`/ready` is referenced nowhere outside the controller and `main.ts:52` prefix exclusion list. `smoke.mjs:24` only checks `/health`.

**Impact:** With `APP_DATABASE_URL` wrong, the pooler down, or the Prisma pool exhausted, the instance stays "healthy" and keeps receiving 50% of traffic. A rolling deploy of a container whose DB credentials are broken passes the probe and goes live.

**Failure scenario:** Supabase project paused (free/pro inactivity) or password rotated without updating DO. Both instances report healthy; every request 500s; DO never restarts or alerts.

**Fix:** Point DO's `health_check.http_path` at `/ready`, set `initial_delay_seconds: 20` (the migrator runs before `listen`), `timeout_seconds: 3`, `failure_threshold: 3`. Keep `/health` for Docker-local liveness. Add a cheap `SELECT 1` through *both* Prisma clients (`PrismaService` pooled + `AuthPrismaService` direct, `auth-prisma.service.ts:19`) and a `schema_migration` row count check so an instance running against an un-migrated DB reports not-ready. Do **not** add external providers to `/ready` (Twilio down must not pull the API out of rotation).

---

### SRE-03 — The `jobs` worker container claims and silently destroys customer transaction alerts
**Severity:** High  **Confidence:** Confirmed  **Effort:** S

**Location:** `.do/app.yaml:56-72` (worker envs), `apps/api/src/modules/workers/worker-runner.service.ts:44-71`, `txn-alert.service.ts:48-72`, `sms-sender.service.ts:88-96`, `packages/db/prisma/sql/2026-08-03_claim_alerts_settled.sql:20-35`.

**Evidence:**
- `ROLE=worker` is read in exactly one place: `main.ts:29` (`const isWorker = process.env.ROLE === 'worker'`) to skip migrations. `WorkerRunner.onModuleInit` (`worker-runner.service.ts:44-49`) gates only on `SKIP_DB`, `NODE_ENV=test`, `WORKERS_ENABLED=false` — so the worker container runs the full interval set, including `txn-alerts` every 15 s.
- The worker's env block (`app.yaml:66-72`) has **no** `SMS_PROVIDER`, `TWILIO_*`, or `TWILIO_TPL_*` variables.
- `claim_txn_alerts` (`2026-08-03_claim_alerts_settled.sql:23`) does `UPDATE outbox SET published_at = now(), attempts = attempts + 1 … FOR UPDATE SKIP LOCKED RETURNING …` — the row is marked handled at claim time. `txn-alert.service.ts:41-47` documents this: "A row is marked handled whether or not the message got through."
- On the worker, `TxnAlertService.send()` → `config.get('TWILIO_TPL_EARNED')` is undefined → `logger.warn('no template configured…')` → `return false` (`txn-alert.service.ts:161-165`). Even with templates set, `SmsSenderService.provider` would be `'none'` → `sendTemplate` warns `[TEMPLATE NOT SENT — no Twilio provider]` (`sms-sender.service.ts:93-96`).

**Impact:** Three containers poll with SKIP LOCKED; roughly one third of all "you earned X points" / "you redeemed Y" WhatsApps are claimed by a container that cannot send them and are never retried. The welcome message for a first-time member (`txn-alert.service.ts:144-151`) is lost the same way. The `passes.refresh()` Google Wallet update (`:86-90`) also runs on the worker without Google credentials and logs a warning.

**Fix (pick one, all S):** (a) delete the `workers:` component from `.do/app.yaml` — `WorkerRunner` already runs on every API instance and the BullMQ path is dead; (b) or set `WORKERS_ENABLED=false` on the worker; (c) or copy the full Twilio/Google env set to the worker. Additionally make `WorkerRunner` refuse to start `txn-alerts` when `SmsSenderService.configured` is false (`sms-sender.service.ts:54`), and change `claim_txn_alerts` semantics to claim-then-ack (set `published_at` only after a delivered/declined decision, with a `claimed_at` lease) so a crashed relay does not lose rows.

---

### SRE-04 — Settlement failure is a `warn`; unsettled backlog starves; low-balance alert is pull-only and the `wallet.low_balance` event is never emitted
**Severity:** High  **Confidence:** Confirmed  **Effort:** M

**Location:** `settlement.service.ts:19-42`, `superadmin.service.ts:1142-1157` (`lowBalanceAlerts`), `webhook.service.ts:12-17`, `apps/web-superadmin/app/(app)/billing/page.tsx`.

**Evidence:**
```ts
// settlement.service.ts:20-27
.findMany({ where: { groupId, intent: 'redeem', state: 'captured', settledAt: null }, select: { id: true }, take: 200 })  // no orderBy
// :36-39
} catch (e) { this.logger.warn(`settlement failed for ${id}: …`); /* Left unsettled for retry / low-balance alerting. */ }
```
- `drawdownWallet` hits `account_balance_non_negative` CHECK when the group wallet is empty → every one of the 200 rows throws, every 60 s, forever, on all three containers. No counter, no "oldest unsettled age".
- No `orderBy` + `take: 200`: once 200 rows fail permanently (wallet empty, or a single poisoned row such as an idempotency conflict), newer captured redemptions are never selected.
- `lowBalanceAlerts` is a SQL query behind `GET /v1/admin/wallet/low-balance`, rendered by the superadmin billing page. `grep -rn "wallet.low_balance" apps/api/src` matches only the `WEBHOOK_EVENT_TYPES` picker list — no `outbox.emit` for it, no email, no worker. Same for `points.expiring`.

**Impact:** The platform's receivable (brand owes platform per redeemed point) silently stops being drawn down. Nobody is told the wallet is empty. The merchant keeps redeeming on credit the platform never agreed to.

**Failure scenario:** Group wallet reaches zero on day 12. Settlement fails 200×/min across 3 containers (~860k warn lines/day). Redemptions continue for weeks. Discovered at month-end invoicing.

**Fix:** (1) order by `createdAt asc`, add a `settleAttempts`/`settleError` column and skip rows above N attempts into a visible "needs attention" state; (2) emit `wallet.low_balance` from `drawdownWallet`'s caller when `available < lowBalanceThreshold`, and from a daily job; (3) email the group admins + platform ops via `EmailService` on threshold crossing with a 24 h dedupe; (4) metric `settlement_failures_total{group}` and `settlement_unsettled_oldest_seconds` with an alert at > 1 h.

---

### SRE-05 — Suspending a merchant/terminal does not stop it transacting
**Severity:** High  **Confidence:** Confirmed  **Effort:** S

**Location:** `auth/guards/terminal-hmac.guard.ts:61-66`, `superadmin.service.ts:267-276` (`setGroupStatus`), `:969-977` (`setTerminalStatus`), `:958-966` (`revokeTerminalKeys`), `terminal.service.ts` (no status reads).

**Evidence:**
```ts
// terminal-hmac.guard.ts:61-64
const key = await this.authDb.apiKey.findUnique({ where: { publishableId } });
if (!key || key.status === 'revoked') throw new UnauthorizedException('unknown or revoked key');
```
`setGroupStatus` updates `group.status` and `group_wallet.status`; `setTerminalStatus` updates `terminal.status`. `grep -n "status" terminal.service.ts` shows only voucher statuses; `grep -rn "\.status (!==|===) '(active|suspended)'" apps/api/src/modules/terminal-gateway apps/api/src/auth` matches only `auth.service.ts` (customer/user sessions). `WorkerRunner.perBrand/perGroup` *do* filter `status: 'active'` (`worker-runner.service.ts:93,107`) — so a suspended group keeps earning and redeeming at the till but its settlement stops running, widening the drift.

**Impact:** The only effective kill switch is `revokeTerminalKeys` (immediate — the guard reads the key row on every request, no cache). A fraud-freeze runbook ("suspend brand X now") does not work; the operator has to revoke every terminal key individually and later re-issue and re-pair each device.

**Fix:** In `TerminalHmacGuard`, include `terminal: { select: { status } }, brand: { select: { status } }, group: { select: { status } }` in the key lookup (one query, same round trip) and reject with a distinct error code (`merchant_suspended`) that the terminal app renders. Add a `brand.status` check at `setBrandStatus` if that method exists (not found in grep — Needs verification that brand-level suspend exists at all).

---

### SRE-06 — Boot migrator: no lock/statement timeout, DIRECT_URL optional, and a blocked DDL queues the whole table
**Severity:** High  **Confidence:** Confirmed (behaviour) / Likely (lock wait scenario)  **Effort:** S

**Location:** `platform-core/prisma/schema-migrator.ts:128-190`, `config/env.ts:15`, `main.ts:19-37`.

**Evidence:**
- `schema-migrator.ts:132`: `const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;` and `env.ts:15`: `DIRECT_URL: z.string().optional()`. If `DIRECT_URL` is missing in DO, DDL and `pg_advisory_lock` run through Supavisor transaction mode on `DATABASE_URL`, where a session-level advisory lock is meaningless (the backend can change between statements) and `DROP FUNCTION … CREATE FUNCTION` from two instances can collide — exactly the collision the comment at `:144-150` says the lock prevents.
- `new Client(migrationClientConfig(url))` sets no `statement_timeout`, `lock_timeout`, or `connectionTimeoutMillis`. `client.query('SELECT pg_advisory_lock($1)')` blocks indefinitely.
- `ALTER TABLE … ADD COLUMN` needs `ACCESS EXCLUSIVE`. If any old-version instance (still serving during the rolling deploy) holds a transaction on that table, the ALTER waits — and **every subsequent query on that table from both old instances queues behind the ALTER's lock request** until the new container is killed by DO's deploy timeout.
- Failure is fatal (`main.ts:19-37` comment: "A failure here is deliberately fatal"). DO rolls a failed deploy back to the previous build (`schema-migrator.ts:83` records this happening once already), so this is a failed deploy rather than a total outage — but the migration ledger (`schema_migration`) may already contain partially-applied earlier files from the same release, which is fine because files are additive and idempotent (§7.2).
- Packaging coupling: `packages/db/src/migrations.ts:48` lists `2026-08-06_membership_load_spend.sql`, which is currently **untracked** (`git status`: `?? packages/db/prisma/sql/2026-08-06_membership_load_spend.sql`). If `migrations.ts` is committed without the SQL file, `readFileSync` at `schema-migrator.ts:164` throws ENOENT outside the per-file try → boot fatal → deploy fails.

**Fix:** `SET lock_timeout = '5s'; SET statement_timeout = '60s'` on the migration client (retry the file on the next boot — already the designed behaviour), make `DIRECT_URL` required in `env.ts` when `NODE_ENV=production`, add a CI step that asserts every entry in `INCREMENTAL_MIGRATIONS` exists on disk (the e2e test does this implicitly only when the file is present), and document "ADD COLUMN only; CREATE INDEX CONCURRENTLY cannot run inside the per-file transaction — needs a separate out-of-band path".

---

### SRE-07 — No outbound HTTP timeouts anywhere; the per-job `busy` guard turns one hung call into a permanently wedged worker
**Severity:** High  **Confidence:** Confirmed  **Effort:** S

**Location:** `grep -rn "AbortSignal|signal:|AbortController" apps/api/src` → no matches. Call sites: `sms-sender.service.ts:144,185`, `platform-core/email/email.service.ts:43`, `wallet-pass/google-wallet.service.ts:151,184`, `wallet-pass/apns.service.ts:88-95`, `workers/webhook.service.ts:202`, `worker-runner.service.ts:77-88`.

**Evidence:**
```ts
// worker-runner.service.ts:78-84
if (this.busy.has(name)) return; this.busy.add(name);
run().catch(...).finally(() => this.busy.delete(name));
// apns.service.ts:88-95
session = connect(ApnsService.HOST);
await new Promise<void>((resolve, reject) => { session!.once('connect', resolve); session!.once('error', reject); });  // no timeout
```
Node's `fetch` (undici) has no overall request timeout by default (headers timeout 300 s, body timeout 300 s, and a TCP connect that can hang far longer on a black-holed route).

**Impact:**
- `txn-alerts` calls `passes.refresh()` → Google PATCH (`google-wallet.service.ts:151`) and, for Apple, the APNs HTTP/2 connect — one hang holds `busy('txn-alerts')` on that instance forever; the rows it claimed are already marked published (SRE-03) and are lost.
- `webhooks` → a merchant endpoint that accepts TCP and never responds wedges webhook relay+delivery for **all brands** on that instance (per-brand loop is sequential, `worker-runner.service.ts:96-101`).
- OTP request path (`otp-store.service.ts:53` `await this.sms.sendCode(...)`) blocks the HTTP request on Twilio. A Twilio brown-out turns `/v1/customer/auth/otp` into a slow-loris against the API's own connection budget. The DB connection is *not* held during the send (the code is stored first), which limits the blast radius to HTTP concurrency.

**Fix:** Wrap every outbound call with `AbortSignal.timeout(ms)` (Twilio 10 s, Resend 10 s, Google 10 s, webhooks 8 s, APNs connect 5 s via `setTimeout` + `session.destroy()`). Add a max-age to the `busy` guard (if a job has been busy > 5 × its interval, log at error, increment `worker_stuck_total`, and clear the flag). Make OTP delivery fire-and-forget after the DB write with the result recorded on the `otp_code` row.

---

### SRE-08 — Dangling redemption holds never expire server-side; the terminal's crash-recovery assumption is false
**Severity:** High  **Confidence:** Confirmed  **Effort:** M  **Cross-ref:** 04 (ledger), 05 (terminal)

**Location:** `apps/terminal-android/.../checkout/CheckoutViewModel.kt:106-114, 380-395`, `terminal.service.ts` (no expiry path), `packages/db/src/ledger/operations.ts:374` (only `voidRedeem` calls `releasePending`), workers directory (no hold-expiry job).

**Evidence:**
```kotlin
// CheckoutViewModel.kt:106-108
// Crash recovery: a hold left dangling by a killed process is voided on
// relaunch (best-effort; server TTL is the backstop).
```
`grep -rn "state: 'expired'|releasePending|holdTtl|expireHolds" apps/api/src packages/db/src` → the only `releasePending` caller is `voidRedeem`; no job transitions `terminal_transaction.state` `authorized → expired`. The `expired` state exists in the enum (system map §4) but nothing produces it.
```kotlin
// CheckoutViewModel.kt:388-393  (capture failed 3× after an approved card payment)
prefs().edit().remove(PENDING_HOLD).apply()
loyaltyNote = "Point redemption capture pending — flag for back-office reconciliation (hold $holdId)"
```
The note lives in the till's local history only; nothing is sent to the server.

**Impact:** (a) A till that loses power between authorize and capture/void and then is replaced, re-paired, or has its app data cleared leaves `pending_debits` on the customer's account forever — their available balance is reduced by points they never spent. (b) A capture that fails three times after the card payment succeeded leaves a hold the server will eventually… never release, and no reconciliation queue exists. Both are silent.

**Fix:** Add `expiresAt` to `terminal_transaction` on authorize (e.g. 15 min), a `hold-expiry` interval in `WorkerRunner` that voids `authorized` rows past `expiresAt` (`voidRedeem` is already idempotent), and a `GET /v1/terminal/transactions?state=authorized` for the till to reconcile on boot. Make the capture-failure path write a `reconciliation_needed` flag server-side (a `POST /transactions/:id/flag` or reuse `sourceEvent`).

---

### SRE-09 — CI is advisory: DO and Vercel deploy on push to `main`, and the deploy runs schema migrations
**Severity:** High  **Confidence:** Confirmed  **Effort:** S

**Location:** `.do/app.yaml:14-16, 59-61` (`deploy_on_push: true` on both components), `.github/workflows/ci.yml:3-6` (`on: push, pull_request`, no deploy job), `docs/deployment.md` §4 ("Wire a deploy step (DO + Vercel) on `main` after CI passes" — not done).

**Evidence:** The CI workflow has build/typecheck/lint/RLS/e2e/OpenAPI/smoke jobs and no deploy step; DO's GitHub integration triggers its own build on every push irrespective of CI status. There is no staging app spec, no branch protection evidence in the repo, and the migrator runs DDL at boot of the pushed build.

**Impact:** A red CI (failing ledger test, failing RLS isolation test) still ships to production and migrates the production schema. A typo in a migration file reaches Supabase before CI finishes.

**Fix:** Set `deploy_on_push: false` on both components and add a `deploy` job to `ci.yml` gated on `needs: [test]` that calls `doctl apps create-deployment <id>` (token in GitHub secrets). Add a `staging` copy of the app spec pointed at a Supabase branch/project. Enable branch protection requiring the CI check.

---

### SRE-10 — No disaster-recovery plan: PITR tier unknown, no restore drill, no RTO/RPO, pass-signing material absent from the deploy spec
**Severity:** High  **Confidence:** Needs verification (Supabase plan) / Confirmed (repo)  **Effort:** M

**Location:** `docs/security.md:21` (`- [ ] Backups + PITR drills; documented RPO/RTO…` unchecked), `docs/deployment.md`, `DEPLOYMENT.md`, `.do/app.yaml` env list.

**Evidence:**
- No document in `docs/` describes a restore, a rollback, or an RTO/RPO. `grep -n -i "backup|restore|runbook|PITR|RTO|RPO|rollback" docs/security.md` → one unchecked checklist line.
- Supabase daily backups are 7-day retention on Pro; PITR is a paid add-on with 2-minute granularity. Which one this project has is not in the repo. Without PITR, RPO is up to 24 h for an append-only ledger.
- Single DO region (`region: fra`), single Supabase region. No cross-region replica. Expected for this stage; must be written down.
- `.do/app.yaml` carries no `APPLE_*`/`GOOGLE_WALLET_*`/`APNS_*` variables although `wallet-pass/*` reads them (`apns.service.ts`, `google-wallet.service.ts:115 'Google Wallet not configured'`). Either Apple/Google Wallet is unconfigured in production, or those secrets were added by hand in the dashboard and are not reproducible from the spec. Pass regeneration after a DR event depends on the `.p12/.p8` under local `secrets/` (gitignored) — one laptop is the backup.
- Application rollback: DO keeps previous builds and can redeploy one from the dashboard (Needs verification on the account); because migrations are additive-only to date (§7.2), old code on new schema is safe **today**, but nothing enforces that going forward.

**Fix:** Confirm PITR is enabled on the Supabase project; write `docs/runbooks/db-restore.md` and run one restore into a scratch project with a timed checklist (target RTO 1 h, RPO 2 min with PITR); put Apple/Google secrets in the app spec as `type: SECRET` entries and the private keys in a password manager; add a "schema changes must be backward-compatible with N-1 code" rule to `migrations.ts`'s header comment and to CI (a test that runs the previous tag's e2e suite against the new schema is the strong form).

---

### SRE-11 — No graceful shutdown: rolling deploys and OOM restarts drop in-flight requests and never run `onModuleDestroy`
**Severity:** High  **Confidence:** Confirmed  **Effort:** S

**Location:** `main.ts` (entire bootstrap), `worker-runner.service.ts:73-75`, `prisma.service.ts:26-28`, `auth-prisma.service.ts:28-30`.

**Evidence:** `grep -rn "enableShutdownHooks|SIGTERM|SIGINT|beforeApplicationShutdown|OnApplicationShutdown" apps/api/src` → nothing. Nest does not install signal handlers unless `app.enableShutdownHooks()` is called, so on SIGTERM Node exits immediately: the HTTP server is not closed, keep-alive sockets are cut, `WorkerRunner.onModuleDestroy` (clear intervals) and `PrismaService.onModuleDestroy` (`$disconnect`) never run. `timer.unref()` at `:86` only affects an idle event loop.

**Impact:** Every deploy produces a burst of connection resets on live tills and apps. Postgres rolls back interrupted ledger transactions (safe), but a terminal mid-`earn` gets an IOException → `enqueueEarn` (`CheckoutViewModel.kt:404-408`) → replay later with the same idempotency key (safe via `terminal.service.ts:644-647`). A terminal mid-`redeemAuthorize` gets "Loyalty service unreachable" (`:330`) and the cashier must retry; a terminal mid-`capture` retries three times at 1.2 s (`:381-385`) — a container restart takes longer than 3.6 s, so a deploy during a capture produces the SRE-08 "flag for reconciliation" path. Interval jobs in the middle of `relayOutbox` (one transaction, rolled back — safe) or `deliverPending` (webhook POSTed, row update lost → duplicate delivery on next tick).

**Fix:** `app.enableShutdownHooks()` in `main.ts`; implement `beforeApplicationShutdown` in `WorkerRunner` that clears intervals and awaits in-flight `busy` jobs up to 10 s; set `server.keepAliveTimeout` > DO's LB idle timeout; add a `terminationGracePeriod`-style 15 s drain (DO sends SIGTERM then SIGKILL after a grace window — Needs verification of DO's exact grace period, documented as 30 s for App Platform in older docs).

---

### SRE-12 — Env validation lets a broken production boot "successfully"
**Severity:** High  **Confidence:** Confirmed  **Effort:** S  **Cross-ref:** 02 (RLS bypass), 07 (infra)

**Location:** `config/env.ts:4-27`, `prisma.service.ts:16`, `auth-prisma.service.ts:19`, `.do/app.yaml:36-38` comment.

**Evidence:**
```ts
DATABASE_URL: z.string().min(1), APP_DATABASE_URL: z.string().optional(), DIRECT_URL: z.string().optional(),
// PII_MASTER_KEY_BASE64, SMS_PROVIDER, TWILIO_*, RESEND_API_KEY, REDIS_URL, CORS_ORIGINS: not in the schema at all
```
`prisma.service.ts:16`: `config.get('APP_DATABASE_URL') ?? config.get('DATABASE_URL')` — if the RLS role URL is missing in production the app silently runs as the owner role with RLS bypassed. The app.yaml comment at `:36-38` admits the Twilio gap: "Without these the API stores a code and logs it, but nothing reaches the customer's phone — which reads as broken sign-in."

**Impact:** The failure modes that matter most (RLS off, PII key missing → every `encrypt()` throws at first use, OTP never delivered) do not fail the boot, do not fail `/health`, and produce no alert. They are discovered by customers.

**Fix:** Add a `production` refinement to `envSchema`: require `APP_DATABASE_URL`, `DIRECT_URL`, `PII_MASTER_KEY_BASE64` (32 bytes after base64 decode), `SMS_PROVIDER` + the matching provider keys, `CORS_ORIGINS`. Log a one-line "config fingerprint" at boot (which provider, which role, RLS on/off) at `warn` level so it is visible in DO logs.

---

### SRE-13 — Prisma interactive-transaction defaults and an unconfigured pool make the API fail fast under modest load, and the terminal interprets those failures as "offline"
**Severity:** Medium  **Confidence:** Likely  **Effort:** S  **Cross-ref:** 11 (perf)

**Location:** `platform-core/tenancy/tenant.service.ts:18-26`, `prisma.service.ts:17`, `auth-prisma.service.ts:20`, `grep -rn "connection_limit|pool_timeout|statement_timeout" --include=*.ts --include=*.yaml .` → only `packages/db/test/ledger.test.ts:28`.

**Evidence:** Every request runs `this.prisma.$transaction(async (tx) => { await this.applyContext(tx, ctx); return work(tx); })` with Prisma defaults `maxWait: 2000`, `timeout: 5000`. Pool size defaults to `num_cpus * 2 + 1` per client; `basic-xs` is a single shared vCPU → 3 pooled connections per client, two clients per container (`PrismaService` pooled on 6543, `AuthPrismaService` **direct on 5432** — every terminal request's key lookup bypasses Supavisor and consumes a direct-port connection, `auth-prisma.service.ts:19`). No `statement_timeout` on either role, so one slow analytics query (`reporting/analytics.service.ts`) can hold a pooled connection for minutes.

**Impact:** At a few dozen concurrent requests per instance, `$transaction` throws P2028 ("Unable to start a transaction in the given time") → `AllExceptionsFilter` → 500. The terminal treats any exception on earn as "offline" and queues it (`CheckoutViewModel.kt:404`), and any exception on redeem as "Loyalty service unreachable" (`:330`) — so a load problem looks like a network problem to the cashier and nobody at RFM sees it (SRE-01).

**Fix:** Set `connection_limit` and `pool_timeout` explicitly in `APP_DATABASE_URL`, set `statement_timeout = '15s'` and `idle_in_transaction_session_timeout = '30s'` on the `loyalty_app` role (`ALTER ROLE loyalty_app SET …`), raise `maxWait` to 5 s for the terminal path, alert on `prisma_pool_wait_seconds` p95 (§3), and consider routing `AuthPrismaService` through the pooler (its queries are single-statement lookups, pooler-safe).

---

### SRE-14 — Terminal offline queue: 4xx replies are dropped as "replayed", replay only runs on app launch or idle screen, no age cap, and the original sale time is never sent
**Severity:** Medium  **Confidence:** Confirmed  **Effort:** M  **Cross-ref:** 04, 05

**Location:** `apps/terminal-android/.../data/OfflineOutbox.kt:54-89`, `CheckoutViewModel.kt:116, 400-408`, `ui/HomeScreen.kt:70`, `terminal.service.ts:641-647, 829-840`, `dto.ts:175-181`.

**Evidence:**
```kotlin
// OfflineOutbox.kt:73-78
} catch (e: TerminalApi.ApiException) {
    // 4xx = permanently unprocessable … drop it
    if (e.status in 500..599) remaining.add(op) else replayed++
} catch (_: Exception) { remaining.add(op) }
```
- A 401 (key revoked, clock skew > 300 s after a battery-flat reboot resets the RTC), 409 (idempotency conflict), 429, or 400 drops the earn **and counts it as a success**. Nothing is logged server-side because the server never saw it, and the till shows "replayed N".
- `enqueueEarn` is triggered by `catch (_: Exception)` on the live earn (`CheckoutViewModel.kt:404`) — including 4xx responses, which then get dropped on replay. A 400 from a validation change on the server is a silent points loss.
- Replay is invoked only from `CheckoutViewModel.init` (`:116`) and `HomeScreen` composition (`:70`). No connectivity callback, no periodic timer. A till that stays in checkout all day replays at close of business at the earliest.
- `queuedAt` is stored (`OfflineOutbox.kt:34`) but not sent; the server posts the earn with `occurredAt = now()`, so campaign multipliers, happy-hour rules, visit streaks and expiry buckets are evaluated at replay time (Likely — depends on the rules engine reading the clock, `loyalty.service.ts:earnWithTx`).
- Server side: `batch()` (`terminal.service.ts:829-840`) is per-item (not all-or-nothing), sequential, each item its own transaction, `ArrayMaxSize(200)` — correct semantics — but the Android app never calls it; it replays one op at a time via `resolve` + `earn`. Dedup relies on `terminal_transaction(actor_id, idempotency_key)` (`:644-647`), which is independent of the member token, so a replay with a fresh `resolve` token is matched correctly. 
- No server-side visibility of outbox depth or age; `config`/`app-version` calls do not carry it.
- The queue file is plain JSON in app-private storage (`outbox.json`), rewritten on every change, no fsync; a power cut mid-write loses the whole queue (`load()` swallows the parse error at `:97-99` → empty list).

**Fix:** Treat 401/408/409/429/5xx and `IOException` as retryable; drop only 400/404/422 and log them to the server via a `/terminal/outbox/dropped` endpoint; send `occurredAt: queuedAt`; replay on a connectivity callback plus a 5-minute timer; report `outboxDepth`/`oldestQueuedAt` in the `app-version` heartbeat and alert when oldest > 4 h; write the file atomically (temp + rename).

---

### SRE-15 — PII and secrets in logs: OTP codes with phone numbers, phones and emails on provider errors, public receipt tokens in request logs
**Severity:** Medium  **Confidence:** Confirmed  **Effort:** S  **Cross-ref:** 10 (privacy)

**Location:** `sms-sender.service.ts:72-75, 94, 169, 174, 194, 199`, `email.service.ts:39, 61, 67`, `app.module.ts:53-69`, `terminal-gateway/receipt-public.controller.ts:21, 47`.

**Evidence:**
```ts
this.logger.warn(`[OTP NOT SENT — no SMS provider configured] ${phone} -> ${code}. …`);   // sms-sender.service.ts:72
this.logger.error(`Twilio rejected the send to ${phone}: ${res.status} ${reason}`);        // :169
this.logger.error(`Resend rejected "${message.subject}" to ${to}: …`);                     // email.service.ts:61
```
pino-http is configured with `redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]']` only (`app.module.ts:63`); `autoLogging` is default-on so every request's `req.url` is logged, including `/v1/r/<receipt-token>` (unauthenticated bearer-style token, `receipt-public.controller.ts:21`), `/v1/passes/apple?...` pass JWTs if any are carried in query strings, and `/v1/join/<code>`. The DO log console is shared with everyone who has app access and has no field-level redaction.

**Impact:** On a Twilio incident, the DO log becomes a list of customer phone numbers; with no SMS provider, it is a list of valid OTP codes. Receipt tokens in logs give anyone with DO console access every customer's e-receipt.

**Fix:** Mask phone (`+9715****123`) and email in all five log lines; never log the code (log `otp_code.id`); add `req.url` to a custom serializer that strips `/v1/r/:token` and query strings; add `req.query` and `req.body` to `redact` defensively.

---

### SRE-16 — Exception filter: deliberate 5xx `HttpException`s and non-`Error` throws are not logged with a stack
**Severity:** Medium  **Confidence:** Confirmed  **Effort:** S

**Location:** `platform-core/filters/all-exceptions.filter.ts:36-64`.

**Evidence:** Only the `else if (exception instanceof Error)` branch logs (`:58-61`). A thrown `ServiceUnavailableException`, `InternalServerErrorException`, or `BadGatewayException` (status ≥ 500) returns the envelope with no filter-side log; a thrown string/object (e.g. from a `.catch(() => {})` chain re-throwing `undefined`) is reported as 500 with no log at all. pino-http still writes one `error`-level request line for any 5xx (default `customLogLevel`), so the *fact* of a 500 is logged with the request id — but without `err`, so no stack and no error class. The filter's own `Logger('Exception')` goes through nestjs-pino and does pick up the request-scoped `req.id` via AsyncLocalStorage, so the `Error` branch is correctly correlated.

**Fix:** Log all `status >= 500` with `exception` as the `err` object, `method`, `url`, `tenant` from `currentTenant()`, and increment `http_5xx_total{route}`. Keep the client-facing message generic in production (already done at `:59`).

---

### SRE-17 — Background jobs run on all three containers; `relayOutbox` is not claim-safe, producing duplicate webhook deliveries
**Severity:** Medium  **Confidence:** Confirmed  **Effort:** S

**Location:** `worker-runner.service.ts:11-26, 53-56`, `webhook.service.ts:153-182`.

**Evidence:** The file comment asserts "every job either claims its rows (SKIP LOCKED) or is idempotent, so running on all API instances is safe." `claim_txn_alerts` and `sweep_account_deletions` are claim functions. `relayOutbox` is not:
```ts
const rows = await tx.outbox.findMany({ where: { brandId, publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 200 });  // no FOR UPDATE SKIP LOCKED
for (const row of rows) { … await tx.webhookDelivery.create({ … eventId: row.id … }); await tx.outbox.update({ … publishedAt: new Date() }); }
```
Two instances (plus the worker, SRE-03) can read the same unpublished rows within the same 30 s tick and both create `webhook_delivery` rows for the same `eventId` (no unique constraint on `(endpointId, eventId)` found in the schema — Needs verification against `schema.prisma`). Settlement (`settleOne`) is protected by the ledger idempotency key `settle:<txnId>` (`settlement.service.ts:67`) and expiry by the breakage-journal design (`expiry-sweep.service.ts:11` comment) — those are safe. The per-brand loop also does one `webhookEndpoint.findMany` per outbox row (`:162`) — 200 extra queries per brand per tick (agent 11).

**Fix:** `SELECT … FOR UPDATE SKIP LOCKED` via `$queryRaw` for the outbox batch, or a `claim_outbox_for_webhooks()` definer function like the alerts path; unique index on `webhook_delivery(endpoint_id, event_id)`; or simply run `WorkerRunner` on one designated instance (`WORKERS_ENABLED` on the worker only, after fixing SRE-03).

---

### SRE-18 — Webhook delivery: fixed 30 s retry with no backoff, no timeout, dead-letters are terminal with no retry endpoint and no alert
**Severity:** Medium  **Confidence:** Confirmed  **Effort:** S

**Location:** `webhook.service.ts:9, 184-224`, `modules/webhooks/*.ts` (`grep -rn -i "retry|redeliver|dead"` → nothing).

**Evidence:** `MAX_ATTEMPTS = 6`; `deliverPending` selects `status in (pending, failed)` with no `nextAttemptAt`, so a failing endpoint is retried every 30 s tick and is dead after ~3 minutes — the class comment's "retried with backoff" is not implemented. A merchant endpoint that is down for a 10-minute deploy loses every event in that window permanently. No metric for `status = 'dead'` count; the brand console lists deliveries but cannot re-queue.

**Fix:** Add `nextAttemptAt` with exponential backoff (30 s, 2 m, 10 m, 1 h, 6 h, 24 h), an 8 s fetch timeout, `POST /manage/webhooks/deliveries/:id/retry`, and `webhook_dead_total{brand}` with an alert > 0.

---

### SRE-19 — Capacity: single shared-vCPU instances run image resizing and PDF generation on the request event loop; no memory alert, no autoscaling, 1 s health timeout
**Severity:** Medium  **Confidence:** Likely  **Effort:** S

**Location:** `.do/app.yaml:17-18` (`instance_size_slug: basic-xs`, `instance_count: 2`), `apps/api/package.json:38,44` (`pdfkit`, `sharp`), `receipt-public.controller.ts:47-55` (`@Get(':token/pdf')` builds a `PDFDocument` inline, unauthenticated), `wallet-pass/stamp-strip.ts` + `pass-images.ts` (sharp).

**Evidence:** `basic-xs` is 1 shared vCPU / 1 GB (Needs verification in the DO dashboard). sharp allocates libvips buffers off-heap; pdfkit builds in-process. The public PDF route is unauthenticated and only covered by the 300 req/min default throttle per IP (in-memory, per instance). No `MEM_UTILIZATION`/`RESTART_COUNT` alerts (SRE-01). DO's default health timeout is 1 s; an event loop stalled by a pass-strip render can miss three consecutive probes and trigger a restart mid-traffic.

**Fix:** Add `MEM_UTILIZATION > 80%` and `RESTART_COUNT > 1 / 5 min` alerts; set `health_check.timeout_seconds: 3`; cap PDF concurrency (p-limit 2) or pre-render receipts at write time; `autoscaling: { min_instance_count: 2, max_instance_count: 4, metrics: { cpu: { percent: 70 } } }` is available on DO for `apps-*` and some basic slugs (Needs verification for `basic-xs`).

---

### SRE-20 — In-memory nonce store and throttler: restart reopens the replay window; the two instances already disagree
**Severity:** Medium  **Confidence:** Confirmed  **Effort:** M  **Cross-ref:** 02 (authz) owns the security rating

**Location:** `auth/nonce-store.service.ts:9-24`, `terminal-hmac.guard.ts:75-78`, `app.module.ts:40-42`.

**Evidence:** `private readonly seen = new Map<string, number>()`; the comment at `:4-6` says "in production it is backed by Redis" — it is not; the guard's TODO at `:78` confirms. `gc()` iterates the whole map on every terminal request (O(n) per request; n ≈ terminal req/s × 300 s). The throttler uses the default in-memory storage. `REDIS_URL` is provisioned (`app.yaml:27`) and unused for either.

**Reliability angle:** every deploy (SRE-11) and every OOM restart (SRE-19) silently resets both; a replayed receipt against the *other* instance already succeeds today. Idempotency keys on the ledger side (`reserveIdempotency`, `engine.ts:279-291`) are the real guard against double-earn, so the money impact is bounded to endpoints without an idempotency key (`resolve`, `members/context`, `config`).

**Fix:** `ThrottlerStorageRedisService` and a `SET nonce NX EX 300` nonce store on the existing Valkey; fail-open with a `warn` + counter if Redis is unreachable so a Valkey outage does not take tills down.

---

### SRE-21 — No SLOs, error budgets, or any measurement source from which to compute them
**Severity:** Medium  **Confidence:** Confirmed  **Effort:** M

**Location:** `docs/` (no SLO document), `health.controller.ts`, absence of metrics (SRE-01).

Proposed SLOs are in §5. Until SRE-01's counters exist the only measurement sources are DO's per-service request/latency graphs (coarse, no route split) and Vercel analytics for the consoles.

---

### SRE-22 — `/metrics` is unauthenticated and the code comment describes an exporter that does not exist
**Severity:** Low  **Confidence:** Confirmed  **Effort:** S

**Location:** `health.controller.ts:26-43`, `main.ts:52` (excluded from `/v1` prefix, no guard).

**Evidence:** Returns `pid`, `node` version, RSS/heap to anyone. Low information value to an attacker, but it is on the public hostname with no auth and the comment misleads an operator into believing Prometheus is wired. Fix: when adding prom-client (SRE-01), require `Authorization: Bearer $METRICS_TOKEN` or bind to an internal route; delete the comment.

---

### SRE-23 — Terminal fleet rollback requires a forward-version rebuild; no staged rollout
**Severity:** Low  **Confidence:** Confirmed  **Effort:** M

**Location:** `apps/terminal-android/.../AppUpdater.kt:69, 75-84`, `superadmin.service.ts:1330-1340` (`publishTerminalRelease`), `packages/db/prisma/sql/2026-08-03_terminal_releases.sql:63-78` (`terminal_current_release` = highest published `version_code`).

**Evidence:** `if (release.versionCode <= BuildConfig.VERSION_CODE) return Outcome.UpToDate` — the updater never downgrades. Unpublishing a bad release (`published: false`) stops *new* installs only. SHA-256 of the APK is verified (`:75-84`) and Android enforces same-signing-key upgrades, which is adequate integrity. There is no percentage/branch-based rollout; every paired till is offered the release on its next idle screen (`HomeScreen.kt:74-77`). `mandatory` exists.

**Fix:** Document "rollback = rebuild previous commit with `versionCode+1`, publish, mark mandatory" in the fleet runbook (§8); add an optional `targetTerminalIds`/`percent` column to `terminal_release` for canary tills.

---

### SRE-24 — Transactional email is fire-and-forget with no queue; failures are lost
**Severity:** Low  **Confidence:** Confirmed  **Effort:** S

**Location:** `platform-core/email/email.service.ts:14, 39-67`.

**Evidence:** "Sending never throws. An email is a courtesy alongside the thing that already [happened]"; on Resend 5xx or network error it logs and returns. Team invites, password resets (if emailed), and e-receipt emails during a Resend outage are gone; the user can re-trigger. No `email_send_failures_total`. Fix: write to `outbox` with `aggregate = 'email'` and relay from `WorkerRunner` with retries; add the counter.

---

### SRE-25 — Health-probe request logging noise and no `autoLogging.ignore`
**Severity:** Low  **Confidence:** Confirmed  **Effort:** S

**Location:** `app.module.ts:53-69`.

**Evidence:** No `autoLogging` option → every `/health` hit (DO every 10 s × 2 instances, plus Docker every 30 s if honoured) is an `info` line: ~17k lines/day of noise that will dominate whatever log retention is bought for SRE-01. Fix: `autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' }`.

---

### SRE-26 — Dead BullMQ scheduler connects to Valkey at boot and enqueues jobs nobody consumes
**Severity:** Low  **Confidence:** Confirmed  **Effort:** S

**Location:** `workers/worker-scheduler.ts:16-37`, `.do/app.yaml:27, 70` (`REDIS_URL` set on both components).

**Evidence:** With `REDIS_URL` present the scheduler creates a `Queue('rfm-maintenance')` and adds four repeatable jobs; the comment at `:32-33` says processors "are registered in a dedicated worker process" — none exist (`worker-runner.service.ts:14-19` confirms). ioredis reconnects forever with error logs if Valkey is unreachable, and `new Queue` never rejects, so a Valkey outage shows up only as log spam. The DO Valkey instance is a paid resource doing nothing. Fix: delete `WorkerScheduler` and the `bullmq` dependency, or keep Valkey for SRE-20 only.

---

### SRE-27 — Mobile OTA and app kill-switch degrade acceptably (Info)
**Confidence:** Confirmed

`apps/mobile/app.json:58-63`: `runtimeVersion` policy + `updates.url`; no `fallbackToCacheTimeout` override → expo-updates default 0 ms → the app launches from the embedded/cached bundle immediately and checks for updates in the background; an EAS Update outage does not block launch. `customer-wallet/app-status.controller.ts:26-28` exposes `minVersion` (`APP_MIN_VERSION`) and `maintenance` (`APP_MAINTENANCE=1`) — a working kill switch, but flipping it requires an env change on DO, which restarts the API (SRE-11). Consider reading these from the `platform.settings` JSON instead (`superadmin.service.ts:getPlatformSettings`) so it is a DB write.

### SRE-28 — Partner connector stub always reports healthy (Info)
`partnerships/partner-connector.ts:33-38`: `[STUB] credit …` log + `{ healthy: true, detail: 'stub connector — no external API yet' }`. `conversion.service.ts:122-124` does compensate with `voidRedeem` on connector failure, which is the right shape for the real integration; note that the `.catch(() => {})` on the compensating void (`:124`) would hide a failed compensation — add a counter there when Lulu goes live.

---

## 2. Failure-mode table

| Dependency | Failure | Current behaviour (file ref) | Required behaviour |
|---|---|---|---|
| Supabase Postgres (pooled 6543) | Down / paused / password rotated | Every request 500 via P1001/P2024; `/health` still 200 (`health.controller.ts:11`); no alert; tills queue earns, refuse redeems | `/ready` 503 → DO marks unhealthy; pager within 2 min; terminal shows "offline mode" banner |
| Supavisor pooler | Saturated (P2024/P2028) | `$transaction` maxWait 2 s → 500 (`tenant.service.ts:22`); terminal interprets as offline (`CheckoutViewModel.kt:404,330`); no metric | `prisma_pool_wait_seconds` p95 alert; `statement_timeout` on role; 503 + `Retry-After` instead of 500 |
| Supabase direct 5432 | Connection cap hit | `AuthPrismaService` (every terminal auth + every login) fails → 401/500 (`auth-prisma.service.ts:19`) | Route auth client through pooler or cap its pool to 2 |
| Boot migration | SQL error | Container exits; DO rolls back deploy; old build keeps serving (`schema-migrator.ts:177-180`, `main.ts:19-37`) | Same, plus `DEPLOYMENT_FAILED` alert (§4) |
| Boot migration | Lock wait on live table | Hangs with no `lock_timeout`; queues all traffic on that table behind the ALTER (`schema-migrator.ts:139-166`) | `lock_timeout 5s`, retry next boot |
| Twilio | 5xx / unreachable | OTP: HTTP request blocks until undici timeout; code stored; `delivered:false` returned (`otp-store.service.ts:53`); phone logged (`sms-sender.service.ts:169,174`). Alerts: rows already marked published → lost (`2026-08-03_claim_alerts_settled.sql:23`) | 10 s timeout; fire-and-forget after store; alert rows re-claimable with lease; `sms_provider_errors_total` alert |
| Twilio | WhatsApp template rejected (e.g. 63016) | Logged as error, `delivered:false`, no SMS fallback (`sms-sender.service.ts:106-117` picks one channel) | Fall back to SMS `Body` when `TWILIO_CHANNEL=whatsapp` returns a template/opt-in error |
| Resend | Down | Email lost, logged with recipient (`email.service.ts:61-67`) | Outbox-backed relay with retry |
| Google Wallet API | Hangs | `txn-alerts` job wedged on that instance forever (`worker-runner.service.ts:78-84` + `google-wallet.service.ts:151`) | Timeout + stuck-job watchdog |
| APNs | Connect hangs | Same wedge via `apns.service.ts:88-95` | 5 s connect timeout |
| Merchant webhook endpoint | Slow / black-hole | All brands' webhook relay on that instance stalls (`webhook.service.ts:202`, sequential per-brand loop) | 8 s timeout, per-endpoint circuit breaker |
| DO Valkey | Down | ioredis reconnect log spam from `worker-scheduler.ts:24`; nothing else depends on it | Remove or use for nonces/throttle with fail-open |
| EAS Update server | Down | App boots from cache (`app.json:61-63`, default `fallbackToCacheTimeout`) | OK as-is |
| Terminal ↔ API network | Blip after card payment | Earn queued with idempotency key; replayed on next launch/idle screen (`OfflineOutbox.kt:54-89`); redeem refused; capture retried 3× then "flag for reconciliation" locally (`CheckoutViewModel.kt:381-393`) | Replay on connectivity + timer; capture failure recorded server-side; hold expiry job |
| Terminal clock | Skew > 300 s | 401 "timestamp outside allowed skew" (`terminal-hmac.guard.ts:56-58`); queued earns dropped as "replayed" on replay (`OfflineOutbox.kt:76`) | Treat 401 as retryable; surface skew error on the till; NTP check at boot |
| Terminal API key | Revoked | Immediate 401 on next request (`terminal-hmac.guard.ts:64`) — correct | Add distinct error → "contact support" screen |
| Merchant / terminal | Suspended via superadmin | No effect on terminal traffic (SRE-05) | Reject at guard |
| API container | SIGTERM (deploy/OOM) | Immediate exit; in-flight requests reset; intervals not cleared (`main.ts`, no shutdown hooks) | Drain 15 s |
| DO region fra | Outage | Total outage; no failover; tills queue earns only | Documented RTO; accept for now |
| Supabase | Data loss / bad migration | No restore runbook; PITR tier unknown (`docs/security.md:21`) | PITR + drilled restore |

---

## 3. Metrics that matter (none exist today)

All emitted via `prom-client` default registry from the named site; labels kept low-cardinality (brand id is acceptable at this tenant count; never membership id).

| # | Metric | Type | Emit at | Why |
|---|---|---|---|---|
| 1 | `terminal_receipts_total{brand,result=ok\|error}` | counter | `terminal.service.ts:createReceipt` / `transaction()` earn branch | Primary business heartbeat; drop to zero during opening hours = outage |
| 2 | `earn_failures_total{brand,reason}` | counter | `AllExceptionsFilter` when route = `/v1/terminal/transactions` and intent = earn; `LedgerError` codes | Rules/ledger regressions |
| 3 | `redeem_total{brand,phase=auth\|capture\|void,result}` | counter | `terminal.service.ts:641/745/796` | Money path; capture:auth ratio ≠ 1 is the SRE-08 signal |
| 4 | `settlement_failures_total{group}` + `settlement_unsettled_oldest_seconds{group}` | counter + gauge | `settlement.service.ts:37` and a `min(createdAt)` query per tick | Silent receivable drift |
| 5 | `outbox_unpublished_oldest_seconds` + `outbox_unpublished_total` | gauge | one query per `webhooks` tick | Relay health across all three consumers |
| 6 | `webhook_deliveries_total{status}` + `webhook_dead_total{brand}` | counter + gauge | `webhook.service.ts:208-220` | Partner-visible SLA |
| 7 | `otp_sends_total{provider,result}` + `sms_provider_errors_total{provider,code}` | counter | `sms-sender.service.ts:158-176` | Sign-in availability; Twilio billing anomalies |
| 8 | `prisma_pool_wait_seconds` (histogram) + `db_errors_total{code}` | histogram + counter | Prisma `$on('query')`/middleware or wrap `tenant.service.ts:run` | Pooler saturation before it becomes 500s |
| 9 | `http_requests_total{route,status}` + `http_request_duration_seconds{route}` | counter + histogram | Nest interceptor or pino-http `customSuccessMessage` hook | 5xx rate and p95 per surface for the SLOs |
| 10 | `worker_runs_total{job,result}` + `worker_stuck{job}` (gauge 0/1) + `worker_last_success_timestamp{job}` | counter + gauges | `worker-runner.service.ts:77-88` | Detects the SRE-03/SRE-07 wedges; "no successful txn-alerts run in 5 min" is pageable |

Bonus: `hmac_auth_failures_total{reason}` (`terminal-hmac.guard.ts` each throw) distinguishes a clock-skew fleet incident from a revoked key.

---

## 4. Alerting to add

### 4.1 DigitalOcean App Platform (`.do/app.yaml`) — native, email/Slack only

```yaml
alerts:                                   # app-level
  - rule: DEPLOYMENT_FAILED
  - rule: DEPLOYMENT_LIVE
  - rule: DOMAIN_FAILED
services:
  - name: api
    health_check:
      http_path: /ready                   # SRE-02
      initial_delay_seconds: 20
      period_seconds: 10
      timeout_seconds: 3
      failure_threshold: 3
      success_threshold: 1
    alerts:
      - rule: CPU_UTILIZATION
        value: 80
        operator: GREATER_THAN
        window: FIVE_MINUTES
      - rule: MEM_UTILIZATION
        value: 80
        operator: GREATER_THAN
        window: FIVE_MINUTES
      - rule: RESTART_COUNT
        value: 1
        operator: GREATER_THAN
        window: FIVE_MINUTES
    log_destinations:                     # SRE-01; one of papertrail | datadog | logtail | open_search
      - name: logtail
        logtail:
          token: ${LOGTAIL_TOKEN}
```
(`alerts` rule names, `window` enum and `log_destinations` schema per the DO app-spec reference — verify field names against the current `doctl apps spec validate` before applying.)

### 4.2 Needs an external pager (Better Stack / Grafana Cloud / PagerDuty), fed by §3 metrics or a log-based alert

| Alert | Condition | Severity |
|---|---|---|
| API down | `/ready` external probe fails from 2 regions for 2 min | page |
| 5xx rate | `http_requests_total{status=~"5.."} / total > 1%` over 5 min on `/v1/terminal/*` | page |
| Terminal latency | p95 `http_request_duration_seconds{route=~"/v1/terminal/.*"}` > 0.5 s for 10 min | ticket |
| Receipts flatline | `rate(terminal_receipts_total[15m]) == 0` between 09:00–23:00 Gulf while yesterday same window > 0 | page |
| Settlement | `settlement_failures_total` increase > 0 in 10 min, or `settlement_unsettled_oldest_seconds > 3600` | page (money) |
| Low wallet | `/admin/wallet/low-balance` non-empty (cron curl until SRE-04 emits) | ticket → merchant |
| Outbox lag | `outbox_unpublished_oldest_seconds > 300` | page |
| Worker stuck | `time() - worker_last_success_timestamp{job} > 5 × interval` | page |
| Webhook DLQ | `increase(webhook_dead_total[1h]) > 0` | ticket |
| OTP | `sms_provider_errors_total` rate > 20% of `otp_sends_total` over 10 min | page |
| DB | `db_errors_total{code=~"P1001\|P2024\|P2028"}` > 0 in 5 min | page |
| Log-based (immediate, no metrics needed) | DO log line matches `OTP NOT SENT`, `TEMPLATE NOT SENT`, `settlement failed`, `schema: .* failed`, `Twilio unreachable` | page |

---

## 5. SLOs (proposed) and measurement source

| Surface | SLI | Objective (30-day) | Error budget | Source |
|---|---|---|---|---|
| Terminal path (`/v1/terminal/receipts`, `/transactions*`, `/members/resolve`) | Availability = non-5xx (and non-P2028-mapped) responses / total | 99.9 % | 43 min/month | §3 #9 at the API; cross-check with terminal `app-version` heartbeat carrying `outboxDepth` |
| Terminal path | Latency p95 ≤ 300 ms, p99 ≤ 800 ms (server-side, excludes till network) | 99 % of 5-min windows | — | §3 #9 histogram |
| Customer app (`/v1/customer/*`, `/v1/customer/auth/otp`) | Availability non-5xx | 99.5 % | 3.6 h/month | §3 #9 |
| OTP delivery | `delivered:true` / requests (excl. throttled) | 98 % | — | §3 #7 |
| Consoles (`/v1/manage/*`, `/v1/admin/*`) | Availability non-5xx | 99.5 % | — | §3 #9; Vercel analytics for the front-end |
| Transaction alerts | Alert sent within 120 s of sale | 95 % | — | `outbox.created_at` → Twilio accepted timestamp (needs `sent_at` column) |
| Settlement freshness | Captured redemption settled within 10 min | 99 % | — | §3 #4 |
| Webhooks | First delivery attempt within 60 s; delivered within 24 h | 99 % / 99.9 % | — | §3 #6 |

Error-budget policy: when the terminal-path budget is > 50 % consumed in a month, freeze non-reliability deploys to `api` until the burn rate is under 1×.

---

## 6. Tracing and request-id propagation (checked)

- No OpenTelemetry (`grep -rn opentelemetry apps/api` → nothing). With 3 identical containers and one DB, distributed tracing is not the gap; per-request DB timing is (§3 #8). Rated Low; revisit when a second service (partner connector, BullMQ worker) exists.
- Request id: `app.module.ts:56-61` honours inbound `x-request-id` or generates a UUID and echoes `X-Request-Id`. `AllExceptionsFilter` puts `req.id` into the error envelope (`:40, 63`). Nest `Logger` calls inside a request pick up the pino request child logger via nestjs-pino's AsyncLocalStorage, so service-level `logger.warn` lines are correlated — **Confirmed** for the request path.
- Not propagated outbound: `sms-sender.service.ts:144`, `email.service.ts:43`, `google-wallet.service.ts:151`, `webhook.service.ts:202` send no `X-Request-Id`; webhook consumers get `X-Loyalty-Event-Id` only. Worker-originated logs have no request id (expected) and no job-run id (add one per `every()` invocation).
- Terminal: `TerminalApi.kt:259-267` sends no request id; the server-generated one is returned in `X-Request-Id` but the Kotlin client does not read or log it — a cashier's error screen cannot be matched to a server log line. Add `res.header("X-Request-Id")` to `ApiException`.

---

## 7. DR, rollback, migrations

### 7.1 RTO/RPO today (Needs verification on Supabase plan)
- **RPO:** 24 h (daily backup) unless PITR is on → 2 min.
- **RTO:** undefined; no documented procedure; restore of a Supabase project into a new project plus DO env rotation plus Vercel env update is realistically 2–4 h for someone doing it the first time.
- **App rollback:** DO "redeploy previous build" (dashboard) — minutes; no runbook.
- **Pass artefacts:** Apple/Google passes are regenerated from DB rows (`pass_registration`, `wallet_pass_data` tables, `2026-08-06_*.sql`) — no separate backup needed, but signing material exists only in local `secrets/` (system map §1).

### 7.2 Is the schema additive-only so far? **Yes (Confirmed).**
`grep -n -i -E "DROP (TABLE|COLUMN)|RENAME|ALTER COLUMN .* TYPE|SET NOT NULL|DROP CONSTRAINT|DROP INDEX|TRUNCATE" packages/db/prisma/sql/*.sql` → no matches. The only `DELETE FROM` statements are inside function bodies (`otp_code` cleanup, `push_token` on account deletion, `pass_registration` unregister). `DROP FUNCTION IF EXISTS` precedes `CREATE FUNCTION` for signature changes (`2026-08-03_claim_alerts_settled.sql:12-18`), which means during a rolling deploy the still-running old instance calling the **old** one-argument `claim_txn_alerts(int)` fails for the seconds between migration and its own restart — harmless here (next tick retries), but a pattern that will bite on a hotter function. Conclusion: redeploying the previous build after any migration shipped to date is safe. There is no down path and nothing enforces additivity going forward (SRE-10 fix).

### 7.3 Terminal fleet offline mode (answers to the brief)
- **How long can a till run offline?** Indefinitely for earns and e-receipts (no cap on `outbox.json` size or age, `OfflineOutbox.kt`); never for redemptions or voucher redemption (live hold required, `CheckoutViewModel.kt:322-332`); `config` is cached (`settings.cachedServerConfig()`, `:118-120`) so valuation survives a restart offline.
- **What is lost?** Any queued earn that gets a 4xx on replay (SRE-14); the whole queue if the JSON file is corrupted by a power cut mid-write (`OfflineOutbox.kt:91-99, 101-108`); the original sale timestamp (not sent).
- **Ordering:** replayed in queue order, one at a time, sequential; no cross-till ordering (none needed — balances are per-journal).
- **Duplicate prevention:** server `terminal_transaction(actor_id, idempotency_key)` unique lookup (`terminal.service.ts:644-647`) returns the existing row; ledger `idempotency_key(actor_id, key)` with request-hash check (`engine.ts:279-291`) is the second layer. A replay whose points differ (rules changed) still matches the first layer because that lookup ignores payload — so the *first* outcome wins, which is correct.
- **Server batch semantics:** per-item results, sequential, each item its own transaction, 200 max (`terminal.service.ts:829-840`, `dto.ts:178`). Not all-or-nothing. The Android app does not use it.

---

## 8. Runbooks required before go-live (none exist in `docs/`)

1. **Deploy rollback (API + consoles).** DO: Apps → rfm-loyalty → Deployments → previous → "Redeploy"; confirm `/ready`; confirm `schema_migration` has no rows newer than the rolled-back build's `INCREMENTAL_MIGRATIONS` (safe today per §7.2). Vercel: `vercel rollback` / promote previous. Include the "migrations.ts lists a file that isn't in the image" failure signature (`schema SQL directory not found` / `ENOENT`).
2. **Database restore (Supabase).** PITR to timestamp → new project or in-place; rotate `DATABASE_URL`/`DIRECT_URL`/`APP_DATABASE_URL` in DO (both components); re-run `ALTER ROLE loyalty_app WITH LOGIN PASSWORD`; redeploy; verify `audit_log` hash chain continuity and `journal` count against the last `BrandDailyMetric`. Drill it once and record the timing.
3. **Secret rotation: JWT / HMAC / PII key.** JWT: rotating `JWT_ACCESS_SECRET` invalidates all admin, customer, wallet, *terminal member tokens*, and Apple pass tokens at once (one secret signs all, system map §3) — schedule out of hours; refresh tokens survive if `JWT_REFRESH_SECRET` is untouched. HMAC: there is **no overlap** (`terminal-hmac.guard.ts:24-33`); rotation = `revokeTerminalKeys` + `issueTerminalKey` + physical re-pair per till — plan a maintenance window per branch. PII key: no re-encryption tool exists; `readMaybeEncrypted` (`txn-alert.service.ts:178-181`) tolerates plaintext, not a second key — rotation requires a new backfill job modelled on `pii-backfill.service.ts`. Document that rotation is currently a multi-day project, not a runbook step.
4. **Twilio outage / WhatsApp template rejection.** Symptoms (`Twilio rejected the send … (63016|21610|30008)`, `Twilio unreachable`); customer sign-in impact (no fallback channel); interim: set `TWILIO_CHANNEL=sms` + `TWILIO_FROM` (requires redeploy) or `SMS_PROVIDER=http` to a second gateway; communicate via app-status `maintenance` message; afterwards, lost transaction alerts are not recoverable (SRE-03) — note for customer support.
5. **Terminal fleet bad release.** `PATCH /v1/admin/terminal-releases/:id` `published:false` immediately (stops new installs); rebuild previous commit with `versionCode+1`, upload, publish with `mandatory:true`; monitor `terminal.app_version_code` distribution (`terminal.service.ts:187-200` records it) until the fleet converges; tills do not downgrade (SRE-23).
6. **Suspected fraud: freeze a brand / terminal.** Today the only immediate switch is `POST /v1/admin/terminals/:id/keys/revoke` (`revokeTerminalKeys`) per terminal; `setGroupStatus('suspended')` and `setTerminalStatus` do **not** stop traffic (SRE-05). Runbook must say so until fixed. Also: `adjustPoints` reversal procedure, voucher cancel (`superadmin.service.ts:839`), and how to read the `audit_log` chain for the terminal's actor id.

---

## 9. Local verification performed

- `apps/api/test/schema-migrator.e2e.test.ts` (embedded Postgres): see the result block appended below by the run (it covers apply-once, no-op second run, columns present, unreachable DB rejects, and two concurrent migrators). This test does **not** cover a lock-wait or a missing SQL file on disk.

```
pnpm exec vitest run test/schema-migrator.e2e.test.ts   (apps/api, embedded PostgreSQL 17.10 on 127.0.0.1:54330)
✓ applies what is pending and records it                                   147 ms
✓ is a no-op the second time — every restart runs it again                  47 ms
✓ leaves the schema usable — the columns the app queries are really there   18 ms
✓ does not silently succeed when it cannot reach a database                  3 ms
✓ two instances booting together do not collide                            131 ms
✓ TLS › require and prefer encrypt without demanding a trusted chain
✓ TLS › verify-full and verify-ca still verify
✓ TLS › no sslmode means no TLS — local Postgres speaks plaintext
✓ TLS › strips sslmode so pg cannot re-derive it from the string
Test Files 1 passed (1) · Tests 9 passed (9) · Duration 8.33 s · exit 0
```
Note: the run included the uncommitted `2026-08-06_membership_load_spend.sql` because the file exists on disk in this working tree; the SRE-06 packaging risk is about committing `migrations.ts` without it.

---

## 10. Not assessed

- Actual DO plan limits, health-check settings in effect, log retention days, whether Dockerfile `HEALTHCHECK` is honoured, autoscaling availability for `basic-xs` (no production access).
- Supabase project: PITR status, compute tier, connection limits on 5432/6543, `statement_timeout` role settings, backup schedule.
- Vercel: console availability, edge errors, function timeouts (consoles are static client-side apps calling the API; agent 06).
- Twilio account configuration (messaging service, template approval states), Resend domain status.
- Apple/Google Wallet production configuration (absent from app spec; may exist in dashboard).
- Load testing: no capacity numbers were measured; SRE-13/19 are reasoned from defaults.
- Ledger correctness under concurrent replay (agent 04), HMAC/nonce security rating (agent 02), SSRF on webhook URLs (agent 01/03), DB index coverage for the worker queries (agent 09/11).

## 11. Positive controls verified

- Boot migrator takes a Postgres advisory lock, uses one transaction per file, records a checksum ledger, and is covered by an e2e test that runs the list twice and runs two migrators concurrently (`schema-migrator.ts:151-181`, `schema-migrator.e2e.test.ts:33-76`).
- Migrations to date are strictly additive (§7.2); old-build rollback is safe.
- Worker container does not run migrations (`main.ts:29-31`), avoiding DDL through the pooler.
- Transactional outbox: events are written in the same transaction as the ledger change (`outbox.service.ts:12-29`, `terminal.service.ts:669-680`), so no alert/webhook is emitted for a rolled-back sale, and a replayed sale emits nothing.
- `claim_txn_alerts` and `sweep_account_deletions` use `FOR UPDATE SKIP LOCKED` definer functions, so multiple consumers cannot double-send.
- Settlement is idempotent per terminal transaction via the ledger idempotency key `settle:<txnId>` (`settlement.service.ts:67`); expiry sweep is designed to be re-run safe (`expiry-sweep.service.ts:11`).
- Terminal API key revocation is immediate: the guard reads the key row on every request with no cache (`terminal-hmac.guard.ts:61-64`).
- Terminal offline queue preserves the original idempotency key and the server dedupes on it (`OfflineOutbox.kt:64-70`, `terminal.service.ts:644-647`); the terminal app's OkHttp client has explicit connect (8 s) and read (15 s) timeouts (`TerminalApi.kt:27-28`); the till voids a dangling hold on relaunch (`CheckoutViewModel.kt:106-114`).
- Request ids are generated/honoured and echoed (`app.module.ts:56-61`), included in error envelopes, and attached to in-request service logs via nestjs-pino.
- pino redacts `authorization`, `cookie`, `x-api-key` headers; production output is JSON (no pretty transport) (`app.module.ts:63-67`).
- `WorkerRunner` has a per-job overlap guard and never lets one brand's failure stop the loop (`worker-runner.service.ts:77-101`).
- Background jobs are disabled in tests and can be disabled per instance with `WORKERS_ENABLED=false`.
- Terminal APK updates are SHA-256 verified before install and only offered on the idle screen (`AppUpdater.kt:75-84`, `HomeScreen.kt:62-64`).
- Mobile app boots from the cached bundle when the update server is unreachable (`app.json:58-63`).
- A customer-app kill switch (`minVersion`, `maintenance`) exists (`app-status.controller.ts:26-28`).
- Lulu conversion compensates (`voidRedeem`) when the connector throws (`conversion.service.ts:122-124`).
