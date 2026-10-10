# 14 — Red-Team Verification (Phase 3)

Independent adversarial verification of the Critical/High claims in `AUDIT/poc/redteam_brief.md`.
Method: for each claim, try to **disprove** it first (trace the real code, not the claimed line), then PoC the
survivors against the **local** environment only. The claims were handed over without the auditors' reasoning.
Verifiers did not see each other's work. Nothing outside the repo was touched; no production system was accessed.

- **Scope:** 9 Critical + 36 High claims.
- **Result:** 39 UPHELD · 5 PARTIAL · 1 DISPROVED-as-stated (C8). Zero fabricated.
- **Runnable PoC:** `AUDIT/poc/ledger_poc.ts` (authored by audit-04, re-run here). Boots an ephemeral embedded
  Postgres on `:54331`, applies the repo's SQL, drives the real services as the **owner** role (RLS bypassed,
  exactly as `apps/api/test/*` do), prints each scenario. Run:
  `cd apps/api && ../../node_modules/.bin/tsx --tsconfig tsconfig.json ../../AUDIT/poc/ledger_poc.ts`
  All 7 scenarios printed `VULNERABLE`; reconciliation reported one drifted account (`pending_debits = -100`).

---

## ⚠ The one decisive open question (flagged per team-lead request)

**Is `APP_DATABASE_URL` actually set in the DigitalOcean dashboard for the `api` and `jobs` services?**

This single runtime fact, not recoverable from the repository, decides several claims at once:

- `apps/api/src/config/env.ts:13` makes `APP_DATABASE_URL` **optional**; `prisma.service.ts:16` silently falls back
  to `DATABASE_URL` (the owner role). Nothing logs the effective DB role at boot.
- `.do/app.yaml:28,73` *declares* `APP_DATABASE_URL` as a dashboard SECRET, but a declared secret can be unset.
- RLS is `ENABLE`, not `FORCE`, on all tenant tables except `terminal_release` (`rls.sql`), so the owner role
  bypasses RLS entirely.

**If set (`loyalty_app`, RLS on):** H7 is TRUE — the background workers enumerate zero tenant rows and silently
never run; H16/H26 narrow to "owner credential present and used on the auth/terminal path"; H27 bites
(`terminal_release` admin ops fail); **C8 is unreachable** because the expiry sweep never executes.

**If unset (owner, RLS off):** the entire API runs as owner with tenant isolation disabled; **C8 is live** and the
PoC's double-expiry is the real behaviour; H16/H26 are at their worst (every domain query bypasses RLS); H27 is
masked only if that role has `BYPASSRLS`.

H7 and C8 **cannot both be true** in one configuration. Either way the background subsystem is broken: it either
never runs (RLS) or runs without tenant isolation (owner). **Resolve with one read-only prod query — do not change
anything:** `select current_user, rolbypassrls from pg_roles where rolname = current_user;` Left for the user.

---

## Per-claim verdicts

### Critical

| ID | Verdict | One-line reason |
|----|---------|-----------------|
| **C1** MOBILE-01/SC-01/SC-02 | **UPHELD** | `keystore.properties` (plaintext store+key password) and `keystore/rfmhub.keystore` are both in `git ls-files`, added in `c3d32f4`; `app/build.gradle.kts:25-37` signs release builds from them; later `*.keystore` gitignore rule does not untrack them. Repo public/private not verifiable locally. |
| **C2** LEDGER-01 | **UPHELD (PoC ran)** | `referral.service.ts:38-70` checks only exist/pending/not-self — no new-member check, no cap; `getOrCreateCode` reissues after each use. PoC B: +3000 pts in 10 rounds. |
| **C3** LEDGER-02 | **UPHELD (PoC ran)** | `loyalty.service.ts redeem` guards the ledger debit with `:auth`/`:cap` idem sub-keys but `tx.voucher.create` runs unconditionally with a fresh code. PoC A: 5 vouchers, one 200-pt debit. |
| **C4** LEDGER-03/DB-02 | **UPHELD (PoC ran)** | `engine.ts:159 releasePending` is unguarded (vs guarded `captureHold`); `capture`/`voidTxn` gate state via non-locking `findFirst` then unconditional update in separate txns; the `account_balance_non_negative` CHECK only guards `available>=0`, so `pending_debits=-100` slips through. PoC C reproduced persistent drift. |
| **C5** PRIV-01/AUTHZ-11 | **UPHELD** | Deletion sweep nulls `phone_enc/email_enc/name` but leaves `person.phone_hash`, `customer_identifier`, and `refresh_token`; `wallet_person_by_phone` / `wallet_join_brand` / terminal enroll key on the surviving hash with no status filter and reactivate the archived membership (same id, untouched ledger). |
| **C6** PRIV-02/PRIV-06/MOBILE-09 | **UPHELD (caveat)** | `SmartPayIntentBridge.kt:129-130` logs every intent extra (incl. `card_no`, `card_expire_date`, EMV tags); API DTO `maskedPan`/`authNo` are `@IsString` only, stored raw, rendered on the unguarded public e-receipt HTML + PDF. Caveat: whether SmartPay returns full vs masked PAN is vendor behaviour. |
| **C7** AUTHZ-01/FE-02/INFRA-04/SC-08 | **UPHELD (conditional)** | `seed.ts` creates `superadmin@rfm-loyalty.dev` / `admin@<slug>.dev` with `ChangeMe123!`, `totpEnabled` never set, no NODE_ENV guard; both console login pages hard-code the creds; no change-password endpoint exists. Conditional on prod having been seeded (not in repo). |
| **C8** LEDGER-04/PERF-01/INFRA-11 | **DISPROVED as stated / CONDITIONAL** | The no-lock double-expiry logic bug is real and PoC D reproduced it under the **owner** role — but under the as-deployed `loyalty_app` config the sweep never runs at all (see decisive question + H7). True prod-shape impact: expiry never happens, not twice. |
| **C9** SRE-01 | **UPHELD** | `.do/app.yaml` has no `alerts`/`log_destinations`; `/metrics` is a hand-built JSON stub (comment claiming prom-client is false); no APM/tracing dep anywhere; pino to stdout only. |

### High

| ID | Verdict | One-line reason |
|----|---------|-----------------|
| **H1** APPSEC-01/API-01/AUTHZ-04/INFRA-03 | **UPHELD** | No Express `trust proxy`; stock `ThrottlerGuard` keys on `req.ip`; OTP 5/min. Notes: per-process store ×2 instances ≈10 OTP/min platform-wide; terminal + passkit are `@SkipThrottle`; all other routes share one 300/min bucket. |
| **H2** APPSEC-02 | **UPHELD** | `rules.ts:95-103` `new RegExp(String(value)).test(...)`, only a 200-char cap, no timeout/RE2; evaluated inside `earnWithTx` within the open `$transaction`; SKU is `@IsString` uncapped. |
| **H3** API-02/APPSEC-03 | **UPHELD** | Webhook `url` is `@IsString` only; `/test` fetch has no `AbortSignal`/timeout and no private-IP filter, returns status or error as oracle; `deliverPending` is a blind variant with `lastError` readable. undici makes the error oracle coarse, the status oracle precise. |
| **H4** API-03 | **UPHELD** | Governance `payload` is `@IsObject` only; `GovernanceInterceptor` captures raw `req.body` pre-pipe; `approve()` passes `proposedPayload` to appliers unvalidated → reward `pointsCost 0` persists. |
| **H5** AUTHZ-02/LEDGER-06 | **PARTIAL** | group_admin holds `group.wallet.manage`; topup + cost-rule routes gated by it; `CostRuleDto.costPerPointMinor` is `@Min(0)` → cpp=0 → settlement settles free. **Correction:** `setCostRule` *does* write an audit row (`cost_rule.set`); topup writes a ledger journal but no AuditLog row. |
| **H6** AUTHZ-03/FE-01 | **UPHELD** | MFA optional incl. superadmin; `enrolMfa` overwrites the TOTP secret and sets `totpEnabled:false` behind `AdminJwtGuard` only (no re-auth) — a stolen access token resets MFA; consoles say MFA is "not wired in this demo UI". |
| **H7** AUTHZ-05/DB-01 | **PARTIAL** | Worker enumeration sub-claim UPHELD and decisive: `perBrand`/`perGroup` query the RLS client with no GUC → zero rows → jobs silently dead under `loyalty_app`. **Login sub-claim DISPROVED:** auth uses the owner `AuthPrismaService`. |
| **H8** LEDGER-05 | **UPHELD** | `adjustPoints` has zero callers; no adjust route; no refund/reverse/clawback path in the terminal gateway — earned points are never clawed back on a payment refund. |
| **H9** LEDGER-07 | **UPHELD (PoC ran)** | Redeem branch enforces no minimum/bill-cap/re-valuation; quote is advisory. PoC E: 1000 pts captured against an AED 1.00 bill (min 500, cap 50%). |
| **H10** LEDGER-08 | **UPHELD** | Module wires only `StubLuluConnector` (no `connectorMode` switch exists); stub `creditPoints` returns `stub_<id>` with no external call, then `captureRedeem` burns points and the allowance is decremented — a phantom credit. Connector call sits inside the DB tx (latent). |
| **H11** LEDGER-09/SRE-04 | **UPHELD** | `settlement.service.ts`: `cpp===0n` → mark settled with zero drawdown; failures swallowed as `logger.warn`; `take:200` with no `orderBy` → persistent-failure starvation. |
| **H12** MOBILE-02 | **UPHELD** | Tokens in plaintext AsyncStorage (`pp_wallet_token`/`pp_refresh_token`), no `expo-secure-store`, `signOut` is a local `multiRemove`, no customer logout route. Nuance: a sessions-DELETE route exists but refuses the caller's own session. |
| **H13** MOBILE-03 | **UPHELD** | Default admin PIN `4321`, no lockout; `DemoEcrTransport` fake approvals go through the identical `api.capture`/`api.earn` path with no demo marker sent to the server. |
| **H14** MOBILE-04/SC-11 | **UPHELD** | `app.json` `runtimeVersion.policy = sdkVersion`; no `codeSigningCertificate` anywhere; `expo-updates` OTA is live and unsigned. |
| **H15** MOBILE-05 | **UPHELD** | Phone/QR → `resolve` → memberToken → `authorize` → `capture` with no customer-side step. Correction: the "can't spend" text is a code comment in `scan.tsx:23-27`, not UI copy; the UI never warns either. |
| **H16** INFRA-01 | **UPHELD** | api+jobs hold `DATABASE_URL`/`DIRECT_URL`; `AuthPrismaService` (owner, prefers unpooled `DIRECT_URL`) is used on every login/refresh/OTP/terminal request incl. writes; RLS is `ENABLE` not `FORCE` (except `terminal_release`). |
| **H17** INFRA-02/SC-03/CQ-04/PRIV-07 | **UPHELD** | `envelope-crypto.service.ts:16-22` falls back to `sha256('rfm-loyalty-dev-key')` with a warning; wraps TOTP seeds, phones, terminal HMAC secrets, webhook secrets. Extra: a wrong prod key makes all existing ciphertext undecryptable → every till 500s. |
| **H18** FE-07/SC-04 | **UPHELD (gap only)** | Lockfile resolves `next@15.5.19` in all three consoles (< 15.5.24). Vercel reachability of the AVIF path unverifiable here. |
| **H19** SC-05/SRE-09 | **UPHELD** | `deploy_on_push: true` on api + jobs; `ci.yml` has no deploy/gate job and admits CI "has been red on every run"; boot-time migration ships on every push to main. |
| **H20** SRE-05/AUTHZ-10 | **UPHELD** | Terminal HMAC guard checks only `apiKey.status === 'revoked'`; suspend handlers touch entity status only, no key cascade — a suspended merchant's tills keep earning/redeeming. |
| **H21** SRE-03 | **UPHELD** | `ROLE` is read only to skip migrations; jobs env has no `TWILIO_*`; `claim_txn_alerts` stamps `published_at` before send; provider resolves to `none` → `delivered:false`, never retried. "~1/3" is an estimate; the loss mechanism is exact. |
| **H22** SRE-02 | **UPHELD** | `/health` does no I/O and returns 200 with the DB down; DO + Dockerfile both probe `/health`; `/ready` (the only DB probe) is unreferenced. |
| **H23** SRE-07/PERF-04 | **PARTIAL** | Zero `AbortSignal` anywhere and OTP awaits Twilio inline: correct. "Forever" overstated — undici defaults wedge ~5 min per call; busy-guard + sequential `perBrand` stall that job for all brands meanwhile. |
| **H24** SRE-08 | **UPHELD** | No code path sets `terminal_transaction.state = 'expired'`; authorized redemption holds live forever server-side. |
| **H25** SRE-11 | **UPHELD** | No `enableShutdownHooks`/SIGTERM handling; exec-form CMD → immediate exit; `onModuleDestroy`/Prisma disconnect never run; in-flight requests cut. |
| **H26** SRE-12/CQ-10 | **UPHELD** | `APP_DATABASE_URL` optional + silent fallback + role never logged; PII key/Twilio unvalidated; `CORS_ORIGINS` unset → reflect-any-origin with credentials, and it is not declared in `.do/app.yaml` at all. |
| **H27** DB-03/AUTHZ-12 | **UPHELD** | `terminal_releases.sql:56-57` reads `app.current_platform`, app sets `app.current_platform_id`; table is `ENABLE`+`FORCE`, policy has no `TO` (binds PUBLIC) → list empty / create fails / publish 404 under `loyalty_app`. Masked only if the owner has `BYPASSRLS`. |
| **H28** PRIV-03 | **UPHELD** | `eraseCustomer` sets `status:'archived'` + audit only; no PII touched; `wallet_join_brand` un-archives the same id from the app. |
| **H29** PRIV-04/PRIV-05 | **UPHELD** | Mobile privacy toggles are `useState` only (never sent to server); enroll DTO is phone + optional name; `Person`/`CustomerMembership` have no consent fields. |
| **H30** PRIV-08/API-05/AUTHZ-07 | **UPHELD** | `platform_support` + `analyst_readonly` hold `platform.report.read`; `listCustomers`/`customerDetail` decrypt phone/email platform-wide with no `audit.record`; interceptor audits writes only. Correction: `/admin/search` returns names + loyaltyId, not phone/email. |
| **H31** PRIV-09 | **UPHELD** | `otp_prune()` defined, zero callers; no delete path for `refresh_token`/`outbox`/`webhook_delivery`/`idempotency_key`/`audit_log` anywhere. |
| **H32** CQ-01/CQ-02 | **PARTIAL** | No HTTP-level tests (no supertest/`createTestingModule`); services built with `new`; guards/ValidationPipe never exercised; API e2e runs as embedded-PG superuser. **Correction:** `packages/db/test/rls.test.ts:88` does `SET LOCAL ROLE loyalty_app` with GUCs, so the RLS suite itself is not vacuous (it just doesn't cover the worker no-GUC path or H27). |
| **H33** CQ-03/SRE-06 | **UPHELD** | `migrations.ts` (modified) lists `2026-08-06_membership_load_spend.sql`, which is untracked; `schema-migrator.ts:159-164` `readFileSync` is outside the per-file try → ENOENT → bootstrap rejection on both instances if `migrations.ts` is committed without the SQL. |
| **H34** CQ-05 | **UPHELD** | `all-exceptions.filter.ts` maps `HttpException` only; `LedgerError` `idempotency_conflict`, `ZodError` (EarnRule.parse), and Prisma `P2002` (no handler anywhere) all become generic 500s. |
| **H35** PERF-02/03/05/06/07/09 | **5 UPHELD, 1 PARTIAL** | Expiry in one `$transaction` with no timeout option (default 5s); no customer_id-leading index on `ledger_account`; analytics raw-scan per request with rollup/RFM only via manual POST (and `brand_daily_metric` never read); refresh_token row per brand-token mint with no purge; settlement scan has no `terminal_transaction(group_id,...)` index. **PARTIAL:** `AuthPrismaService` is a singleton, not per-request — but it is a second pool on the session-mode `:5432` endpoint the repo's own docs call migrate-only, hit on every terminal request. |
| **H36** PERF-11/SRE-17 | **UPHELD (worse)** | `relayOutbox` has no row claim (plain `findMany` + `create`, no `SKIP LOCKED`, no unique on `(endpointId,eventId)`) → duplicate deliveries across instances; sequential with no timeout → one stalled merchant holds all brands. |

---

## Cross-domain attack chain (Phase 3)

**"Mint free value and cash it out undetected."** One actor, starting as an ordinary customer, crossing
Identity → Ledger → Terminal/API → Settlement → Observability. Hops 2–4 are **proven locally** by `ledger_poc.ts`.

1. **Enroll two customer accounts** — phone OTP → wallet token → per-brand customer token. No barrier to holding
   two accounts; the throttle that exists keys on the proxy IP and locks out everyone rather than the attacker
   (**H1 / APPSEC-01**). *[Identity]*
2. **Mint points for free** — the two accounts refer each other in a loop; no new-member check, no cap, code
   reissued after each use (**C2 / LEDGER-01**). *Proven: PoC B, +3000 pts in 10 rounds.* *[Ledger]*
   - Amplifier: redeem one catalog reward and replay the client `idempotencyKey` — N vouchers for a single points
     debit (**C3 / LEDGER-02**). *Proven: PoC A, 5 vouchers for one 200-pt debit.*
3. **Cash out at a till** — present the phone/QR; the terminal resolves it to a member token with no customer
   confirmation (**H15 / MOBILE-05**) and authorizes+captures a redemption that ignores the bill minimum and cap
   (**H9 / LEDGER-07**). *Proven: PoC E, 1000 pts captured against an AED 1.00 bill.* *[API/Terminal]*
   - If the till crashes mid-sale, the crash-recovery void racing the capture both succeed, refunding the points
     while revenue is booked and driving `pending_debits` negative past the CHECK (**C4 / LEDGER-03**).
     *Proven: PoC C.* The attacker keeps the points and spends them again. *[Ledger integrity]*
4. **The platform charges nobody** — settlement marks the redemption settled with zero drawdown when the group
   has cpp=0 or no cost rule (**H11 / LEDGER-09**); a group_admin can set cpp=0 on its own wallet to force this
   (**H5 / AUTHZ-02**). *[Settlement/Billing]*
5. **Nothing detects any of it** — no metrics, alert rules, or log drain exist (**C9 / SRE-01**); PII reads and
   exports leave no audit row (**H30 / PRIV-08**); and if the deployment runs under RLS, the settlement and
   webhook workers never ran in the first place (**H7 / AUTHZ-05**), so no merchant notification or reconciliation
   would surface the drain. *[Observability]*

Net effect: unlimited points created out of nothing, converted to real AED value at the counter, with the platform
billing no one and no telemetry to notice. Four of the five hops are reproduced on the local embedded database.

**Secondary chain (points theft, not proven end-to-end):** a cashier or anyone who sees a customer's static QR /
loyalty id (**H15**) resolves it at the till (terminal surface is `@SkipThrottle`, **H1**) and redeems the
victim's balance with no customer confirmation (**H15/H9**); authorized holds that never expire (**H24**) let a
malicious hold sit indefinitely. Credible from code; not run locally because it needs a real terminal HMAC key.

---

## Undecided from code (needs one read-only prod fact each — leave for the user)

1. **Is `APP_DATABASE_URL` set in the DO dashboard?** Decides H7-vs-C8 and the real severity of H16/H26/H27.
   Read-only check: `select current_user, rolbypassrls from pg_roles where rolname = current_user;`
2. **Was `seed.ts` ever run against production?** Decides whether C7 is Critical (default creds live) or Info.
3. **Is `github.com/Followingae/PartnersPointsEngine` public?** Decides the blast radius of the committed signing
   keystore (C1). Check the repo's visibility in GitHub settings.
4. **Does Feitian SmartPay return a full or masked PAN in `card_no`?** Decides whether C6 is full-PAN logging (PCI
   DSS incident) or masked-PAN leakage. Check one real SmartPay response on a test card.
5. **Vercel AVIF/image-optimizer reachability** for the `next@15.5.19` gap (H18) — depends on whether image
   optimization is enabled on the consoles' Vercel projects.

---

## New findings surfaced by the red team (not in the claim list)

1. **Webhook relay steals customer alerts:** `relayOutbox` stamps `published_at` on every unpublished outbox row
   regardless of age or whether any endpoint matches, while `claim_txn_alerts` only claims rows ≥20s old — a
   `points.*` row visited by any webhooks tick (3 instances × 30s) in its first 20s is marked published and the
   customer WhatsApp/SMS is silently lost. Independent of H21.
2. **Webhook subscriptions never match emitted events:** `WEBHOOK_EVENT_TYPES` (`earn`, `redeem`, `tier.changed`…)
   vs the emitted `points.earned` / `points.redeemed` / `change_request.*`; the match is exact-string, so a
   picker subscription to `earn`/`redeem` never delivers — only `*` or `change_request.*` do.
3. **Coupon over-redemption race (PoC F):** read-then-increment; 6 concurrent redeems of a `maxRedemptions:1`
   coupon → 3 succeeded.
4. **Dead account-creation race recovery (PoC D2):** `engine.getOrCreateAccount`'s lost-race re-read is
   unreachable on Postgres — the unique-violation aborts the whole transaction (25P02) first.
5. **Change-request authz gap:** `POST /manage/change-requests` requires only `brand.campaign.write`, so a
   principal without tier/reward write permission can still propose those changes for superadmin approval.
6. **`CORS_ORIGINS` is absent from `.do/app.yaml` entirely** → the reflect-any-origin-with-credentials fallback
   (H26) is the live production behaviour unless set elsewhere.

---

*Verification performed read-only against the local repository and an ephemeral embedded Postgres. No production
system was accessed; the four prod-only questions above are explicitly deferred to the user.*
