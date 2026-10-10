# 04 — Ledger Integrity & Fraud

Audit date: 2026-10-10. Branch `main` @ afc3fe2 plus the uncommitted membership-card load/spend working tree. Read-only; all runs were against a throwaway embedded Postgres (ports 54329/54331), never against Supabase, DigitalOcean or `api.partnerspoints.ae`.

Evidence standard: every finding cites `file:line`, a worked number, or a reproducible local run. The PoC is `AUDIT/poc/ledger_poc.ts` (run instructions in its header); its output is quoted verbatim in the findings it supports. `pnpm --filter @rfm-loyalty/db test` passes locally (25/25, 3 files) and does **not** cover any of the Critical/High items below.

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 3 | LEDGER-01, LEDGER-02, LEDGER-03 |
| High | 6 | LEDGER-04, LEDGER-05, LEDGER-06, LEDGER-07, LEDGER-08, LEDGER-09 |
| Medium | 10 | LEDGER-10 … LEDGER-19 |
| Low | 5 | LEDGER-20 … LEDGER-24 |
| Info | 4 | LEDGER-25 … LEDGER-28 |

Headline: the double-entry core (`journal`/`entry`/`account_balance`) is sound in isolation and the guarded `UPDATE … WHERE available >= x` pattern genuinely prevents overdraw. The money is lost one layer up: (1) two application flows mint value from nothing for any app user (referral ping-pong, reward-redeem replay); (2) a merchant's own `group_admin` can credit the prepaid wallet that pays for their redemptions; (3) one engine primitive (`releasePending`) is unguarded, so a capture/void race leaves `pending_debits` negative and the balance diverges from the entries; (4) the hourly expiry sweep runs on both API instances with no lock and double-expires; (5) refunds never claw points back and there is no adjustment path at all.

---

## Findings

### LEDGER-01 — Referral ping-pong mints unlimited points for any two app accounts
- **Severity:** Critical · **CVSS 3.1:** 6.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N) · **Confidence:** Confirmed (PoC B)
- **Location:** `apps/api/src/modules/loyalty-rules/referral.service.ts:15-70`, `customer.controller.ts:91-103`
- **Evidence:**
  - `getOrCreateCode` returns a pending code or creates a new one: `findFirst({ … status: 'pending' })` → `referral.create(…)` (`referral.service.ts:17-33`). After a code is redeemed its status becomes `rewarded` (`:60-63`), so the next call issues a fresh code.
  - `redeem` checks only that the code exists, is pending, and `ref.referrerMembershipId !== refereeMembershipId` (`:40-43`). There is no "referee must be a new member", no per-referee limit, no per-referrer cap, no cooldown, and `A refers B` then `B refers A` is allowed.
  - Rewards are hard-coded `REFERRER_REWARD = 100n; REFEREE_REWARD = 50n` (`:7-8`) and posted via `ledger.earnPoints` (`:46-59`), i.e. real liability.
  - PoC output: `10 rounds A↔B: combined balance 0 → 3000 (+3000 pts, 300/round, no cap, no "new member" check, code re-issued after every use).`
- **Impact:** 300 points per round (4 HTTP calls). At the default valuation (`DEFAULT_REDEMPTION_CONFIG`: 100 pts = AED 1.00, `loyalty.service.ts:971-980`) that is AED 3.00/round; under the 300 req/min IP throttle ≈ 75 rounds/min ≈ AED 225/min ≈ AED 13,500/hour per IP, redeemable as till discounts and settled against the merchant's prepaid wallet at `costPerPointMinor`. Also inflates `lifetime` → tiers and the leaderboard.
- **Exploit scenario:** Two phones, two OTP sign-ups, join the brand, loop `GET /customer/referral-code` and `POST /customer/referral/redeem` from each account.
- **Fix:** Reward only when the referee membership was created within N days and has no prior referral as referee (unique index on `referral.referee_membership_id` where not null); one lifetime code per referrer (unique `(brand_id, referrer_membership_id)`); cap referrer rewards per period; require a qualifying first purchase before paying out (`qualifiedAt` already exists for this). **Effort:** S.

### LEDGER-02 — In-app reward redeem: replaying the client idempotency key issues a new voucher every time, points debited once
- **Severity:** Critical · **CVSS 3.1:** 6.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N) · **Confidence:** Confirmed (PoC A)
- **Location:** `apps/api/src/modules/loyalty-rules/loyalty.service.ts:897-939`, `dto.ts:5-9`
- **Evidence:**
  - `idempotencyKey` is "Client-generated" (`dto.ts:6`) and used verbatim: `authorizeRedeem(... key: \`${idempotencyKey}:auth\`)` / `captureRedeem(... key: \`${idempotencyKey}:cap\`)` (`loyalty.service.ts:915-916`).
  - On replay both engine calls return the stored response without touching balances (`operations.ts:272`, `:309`), but the service then unconditionally runs `tx.voucher.create({ … pointsSpent: points, redeemJournalId: cap.journalId })` (`:918-929`). The voucher table is not part of the idempotency response.
  - PoC output: `5 calls, same idempotencyKey: vouchers issued=5 (distinct codes=5), points debited once: available=300 (500-200). Each voucher is worth AED 20 at the till.`
- **Impact:** Unlimited vouchers for the price of one. Each is accepted at the till by `terminal.service.ts:496-555` (`redeemVoucher` → `reserved` → `confirmVoucherHolds`) and carries `discountMinor` real money off the bill. Loss is to the brand (discount), invisible to settlement (no points move).
- **Exploit scenario:** Any customer app user repeats `POST /customer/rewards/:id/redeem` with the same body. No rate limit beyond 300/min.
- **Fix:** Make the voucher part of the idempotent unit: look up `voucher` by `redeemJournalId = cap.journalId` (unique index) before creating, or store the voucher id in the idempotency response and return it on replay; server-generate the idempotency key from `(membershipId, catalogItemId, nonce)` if the client key is kept. **Effort:** S.

### LEDGER-03 — Capture ∥ void race: both succeed, `pending_debits` goes negative, customer refunded while revenue is booked
- **Severity:** Critical (ledger integrity) · **CVSS 3.1:** 4.3 (AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:H/A:N; requires a terminal key or the till's own crash-recovery timing) · **Confidence:** Confirmed (PoC C)
- **Location:** `packages/db/src/ledger/engine.ts:159-166` (`releasePending`), `operations.ts:355-387` (`voidRedeem`), `apps/api/src/modules/terminal-gateway/terminal.service.ts:745-818`
- **Evidence:**
  - `releasePending` is the only balance mutator without a guard: `UPDATE account_balance SET pending_debits = pending_debits - $amount … WHERE account_id = $id` (`engine.ts:160-165`). `captureHold` has `AND pending_debits >= amount` (`:255`), `holdPending`/`applyPosted` have `available >= amount` (`:134`, `:155`).
  - `voidRedeem` calls it unconditionally (`operations.ts:374`) with its own idempotency key (`…:void`), distinct from capture's (`…:cap`), so the two never conflict.
  - The terminal state machine is app-only: `capture`/`voidTxn` do `findFirst` then `update({ where: { id } })` with no `state = 'authorized'` predicate (`terminal.service.ts:747-763`, `:798-809`). Two transactions that both read `authorized` both proceed.
  - `account_balance_non_negative` only checks `posted_credits - posted_debits - pending_debits >= 0` (`ledger.sql:66-70`); a negative `pending_debits` *increases* available and passes.
  - PoC output: `attempt 1 (void delayed 5ms): capture=fulfilled void=fulfilled → txn.state=voided pending_debits=-100 available=400; liability account: posted_debits=200 Σdebit entries=200 pending_debits=-100.` Reconciliation: `Σ pending_debits=-100 vs Σ points of 'authorized' terminal txns=0`.
- **Impact:** Customer keeps 100 points that the capture journal says were spent and that `points_revenue` was credited for; `terminal_transaction.state` ends `voided` while `capture_journal_id` is set; settlement (`state='captured'`) never charges the merchant. Liability overstated by the hold amount; permanent (journals are append-only, no reversal tooling).
- **Exploit scenario:** The till's crash recovery voids any dangling hold at boot (`CheckoutViewModel.kt:106-111`) and on failed capture (`:351`); a capture retry racing that void reproduces this without malice. A compromised terminal key can trigger it at will.
- **Fix:** Guard `releasePending` with `AND pending_debits >= $amount` and raise on 0 rows; make terminal transitions conditional (`updateMany({ where: { id, state: 'authorized' } })` and throw if count 0) **before** calling the ledger; add a CHECK `pending_debits >= 0`. **Effort:** S.

### LEDGER-04 — Hourly expiry sweep runs on every API instance without a lock; concurrent runs double-expire
- **Severity:** High · **CVSS:** n/a (no external actor) · **Confidence:** Confirmed (PoC D)
- **Location:** `apps/api/src/modules/workers/expiry-sweep.service.ts:13-59`, `worker-runner.service.ts:61-62`, `.do/app.yaml` (2× API instances)
- **Evidence:**
  - Comment claims idempotency via "the breakage journal is itself a debit" (`expiry-sweep.service.ts:5-7`). True sequentially, false concurrently: both sweeps read the same `earned_expired`/`posted_debits` snapshot (`:18-31`), compute `toExpire = 100`, and each `applyPosted` passes its guard as long as `available >= 100` after the other commits (`engine.ts:128-135`).
  - `WorkerRunner` runs `point-expiry` on every instance with only a per-process `busy` set (`worker-runner.service.ts:31-32`, `:77-88`); no advisory lock, no `SKIP LOCKED` on the sweep (contrary to the comment at `:22-24`).
  - PoC output: `expired bucket held 100 pts; sweeps reported 100 + 100; expiry entries total 200 pts; customer available 200 (should be 300).`
- **Impact:** Silent, permanent loss of live points for customers whose balance exceeds the expiring amount; breakage income overstated. Probability per hour is low (ticks drift) but non-zero across 2 instances for the life of the deployment.
- **Fix:** `pg_try_advisory_xact_lock(hashtext('expiry:'||brand_id))` at the start of `sweepBrand`; or `SELECT … FOR UPDATE` the liability `account_balance` rows inside the sweep so the second run recomputes after the first commits; add an idempotency key per `(account, bucket)`. **Effort:** S.

### LEDGER-05 — Refunds and voids never claw back earned points; there is no adjustment path at all
- **Severity:** High · **CVSS:** n/a (physical) · **Confidence:** Confirmed
- **Location:** `apps/terminal-android/.../ui/RefundScreen.kt:36-40`, `:93`; `packages/db/src/ledger/operations.ts:162` (`adjustPoints`); API-wide grep
- **Evidence:**
  - The terminal void path calls only the payment app: `app.ecr().voidPurchase(orderNo, reference)` (`RefundScreen.kt:75`) and records `note = "Loyalty points not clawed back automatically — adjust in the console if needed"` (`:93`). No loyalty API call is made.
  - `adjustPoints` exists in the engine (`operations.ts:162-252`) but has **no caller** in `apps/api/src` (grep for `adjustPoints` returns only `operations.ts`, the engine test and the activity-feed label map). No `/manage` or `/admin` route adjusts points. `JournalKind.reverse` is likewise never posted.
- **Impact:** Buy → earn → refund → keep points is a working fraud loop against every merchant; at 1 pt/AED and AED 1.00 per 100 pts that is 1% of refunded turnover converted to discount, plus settlement cost per redeemed point. Support cannot correct any balance.
- **Fix:** Wire the terminal void/refund flow to a `POST /terminal/transactions/:id/reverse` that posts a `reverse` journal (debit liability, credit expense, clamped to available like `adjustPoints`), plus a permissioned, reason-required `adjust` endpoint for support. **Effort:** M.

### LEDGER-06 — A merchant's own `group_admin` can top up their prepaid wallet (self-funding), with no payment reference and no audit row
- **Severity:** High (platform revenue) · **CVSS 3.1:** 4.9 (AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:H/A:N) · **Confidence:** Confirmed (code), reachability Likely
- **Location:** `apps/api/src/auth/authz/authz.service.ts:22`, `superadmin.controller.ts:274-279`, `superadmin.service.ts:1206-1214`, `auth.service.ts:306`, `permissions.guard.ts:20-32`
- **Evidence:**
  - `group_admin: ['group.manage', 'group.wallet.manage', …]` (`authz.service.ts:22`).
  - `POST /v1/admin/groups/:groupId/wallet/topup` requires only `group.wallet.manage` (`superadmin.controller.ts:274-275`). `PermissionsGuard` checks roles only (`permissions.guard.ts:27-30`); `AdminJwtGuard` accepts the `brand_admin` surface, which is what a non-platform login gets (`auth.service.ts:306`).
  - `topUpWallet` posts `topup` directly with the caller's key; there is no `audit.record`, no payment/bank reference, no amount cap (`superadmin.service.ts:1206-1214`). Compare `setCostRule` which does audit (`:1229`).
  - The `groupId` path parameter is not compared with `ctx.groupId`; cross-group writes are stopped only by RLS in production (`rls.sql` loop over `ledger_account`, `journal`, `entry`, `account_balance`).
- **Impact:** The wallet that `SettlementService` draws down for every redeemed point can be credited by the party that owes the money. Platform receivables cannot be trusted from the ledger.
- **Fix:** Drop `group.wallet.manage` from `group_admin` (or split into `group.wallet.read`); require `platform.manage`; record `paymentRef`/`invoiceId` on the journal `source_event`; audit it; put it behind governance dual-control like other platform money actions. **Effort:** S.

### LEDGER-07 — Terminal redemption is not valued or capped server-side; the quote is advisory
- **Severity:** High · **CVSS 3.1:** 4.3 (PR:H, terminal key) · **Confidence:** Confirmed (PoC E)
- **Location:** `terminal.service.ts:718-741`, `:596-638`, `loyalty.service.ts:1011-1022`
- **Evidence:**
  - `redemptionValueMinor` (min, `maxPercentOfBillBps`, rounding) is applied only in `quote` (`terminal.service.ts:614-624`). `transaction(intent: 'redeem')` validates `points > 0` and calls `authorizeRedeem` with the client's `points` (`:719-726`); `amountMinor` is ignored for redeems and `minRedeemPoints` is never checked.
  - PoC output: `bill AED 1.00, maxPercentOfBill 50%, min 500: quote says value=50 fils … authorize+capture of 1000 pts still captured. Settlement will charge the group wallet for 1000 pts.`
  - The money value actually given to the customer is computed on the device (`TerminalApi.kt:452-466`), so the "server-owned redemption valuation" claim (`terminal.controller.ts:214`) holds for display, not for the burn.
- **Impact:** A buggy or modified till can burn more points than the bill allows (customer loss, merchant settlement cost) or fewer than the discount it grants (merchant loss). No server record of the discount amount exists on the transaction.
- **Fix:** Require `amountMinor` on redeem, recompute `redemptionValueMinor` server-side, reject below-minimum and over-cap, and persist `valueMinor` on `terminal_transaction`. **Effort:** S.

### LEDGER-08 — Partner conversion: stub connector is always used, external call sits inside the DB transaction, and the failure path can drive pending negative
- **Severity:** High · **CVSS 3.1:** 6.5 for the stub-in-prod effect (customer loses points for nothing) · **Confidence:** Confirmed (stub, ordering); negative-pending path Needs verification
- **Location:** `apps/api/src/modules/partnerships/conversion.service.ts:1-136`, `partner-connector.ts:20-39`
- **Evidence:**
  - `ConversionService` injects `StubLuluConnector` directly (`conversion.service.ts:15-20`); `Partner.connectorMode` (`dto.ts:7`) is never consulted. The stub returns success for any ref (`partner-connector.ts:28-31`) and credits nothing anywhere.
  - Flow inside one `tenants.run` tx: `authorizeRedeem` → allowance decrement → `connector.creditPoints` → `captureRedeem` → `conversion.update` → `audit.record` (`:109-120`). A real HTTP connector would be called while the DB transaction holds row locks, and if the DB commit later fails the partner has already credited points that were never burned (free partner points); the reverse (burn without credit) happens today with the stub.
  - The `catch` block runs `voidRedeem(...).catch(() => {})` (`:124`). If anything after `captureRedeem` throws a non-DB error (`:119-121`), the hold has already been converted and `releasePending` subtracts again → `pending_debits` negative (same primitive as LEDGER-03). A DB error would instead abort the tx (25P02), so the compensation is at best partially effective.
  - `allowanceWallet.balanceMinor` is read then decremented (`:103-111`) with no `WHERE balance >= cost`; two concurrent conversions can overdraw the allowance (schema has no CHECK on `allowance_wallet.balance_minor`).
- **Impact:** In production today, every "Convert to Lulu" burns the customer's points and debits the merchant's allowance for a partner credit that does not exist. When a real connector ships, the ordering gives free partner points on commit failure and double-spends the allowance under concurrency.
- **Fix:** Select connector by `connectorMode` and refuse `convert` unless `live`/`sandbox`; two-phase: commit `pending` + hold, call partner outside the tx, then capture/void in a second tx with a reconciler for `pending` rows; guard the allowance decrement with `WHERE balance_minor >= cost`; fix `releasePending` (LEDGER-03). **Effort:** M.

### LEDGER-09 — Settlement silently settles for free and never alerts on wallet shortfall
- **Severity:** High (platform revenue) · **CVSS:** n/a · **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/workers/settlement.service.ts:44-75`
- **Evidence:**
  - `const cpp = rule?.costPerPointMinor ?? 0n; … if (cpp === 0n) { update settledAt; return 0n; }` (`:52-58`). A group with no `CostRule` row, or one set to 0, has every redemption marked `settledAt` with no drawdown and no journal.
  - A failed drawdown (wallet insufficient → `LedgerError('insufficient_balance')` from `applyPosted`) is caught and logged at `warn` (`:36-39`); the comment says "low-balance alerting" but nothing reads `GroupWallet.lowBalanceThreshold` and no outbox event is emitted. The row stays `settledAt: null` and is retried every 60 s forever.
  - `costRule.findFirst({ orderBy: { effectiveFrom: 'desc' } })` is evaluated at settlement time, not transaction time (`:49`), so a cost-rule change is applied retroactively to all unsettled rows.
- **Impact:** Platform receivables silently zero for any group without a configured cost rule; wallet exhaustion is invisible except in logs; `issuanceFeeMinor` and `breakageOwner` are stored but never applied (LEDGER-26).
- **Fix:** Refuse to settle (and alert) when no rule exists; emit `wallet.low_balance` / `settlement.failed` outbox events; snapshot `costPerPointMinor` onto the transaction at capture. **Effort:** S.

### LEDGER-10 — `getOrCreateAccount` create-race recovery is unreachable on Postgres; first-touch concurrency fails the whole transaction
- **Severity:** Medium · **Confidence:** Confirmed (PoC D2)
- **Location:** `packages/db/src/ledger/engine.ts:73-120`
- **Evidence:** The `catch` re-reads after a unique violation (`:114-119`), but Postgres has already aborted the transaction: PoC output `two txns create the same customer's first account: fulfilled,rejected — … current transaction is aborted, commands ignored until end of transaction block (25P02)`. It also took the second expiry sweep down in the first PoC run (breakage account creation).
- **Impact:** Two tills earning for a brand-new member at the same moment, the first sweep of a new brand, or two first conversions for a brand fail with a 500 rather than serialising. Availability, not integrity.
- **Fix:** `INSERT … ON CONFLICT DO NOTHING RETURNING id` then select, or a savepoint around the create. **Effort:** S.

### LEDGER-11 — Coupon `maxRedemptions` is read-then-increment; concurrent redeems exceed the cap
- **Severity:** Medium (brand-admin surface only) · **Confidence:** Confirmed (PoC F)
- **Location:** `apps/api/src/modules/coupons/coupon.service.ts:240-265`
- **Evidence:** `validateWithTx` compares `redeemedCount >= maxRedemptions` (`:247`), then `redeem` increments (`:260`). PoC: `maxRedemptions=1, 6 concurrent redeems → 3 succeeded, redeemed_count=3.`
- **Fix:** `UPDATE coupon SET redeemed_count = redeemed_count + 1 WHERE id = $1 AND redeemed_count < max_redemptions` and check the row count; same for per-customer limit via a unique partial index. **Effort:** S.

### LEDGER-12 — Zero-value earns tick stamp cards and visit challenges; a till can mint reward vouchers without a sale
- **Severity:** Medium · **CVSS 3.1:** 4.3 (PR:H) · **Confidence:** Confirmed (code)
- **Location:** `loyalty.service.ts:260-266`, `gamification.service.ts:187-191`, `:205-207`, `:280-304`
- **Evidence:** When `decision.points <= 0` the earn path still calls `gamification.onEarnWithTx(…, 0n, { isVisit })` (`loyalty.service.ts:262-265`); visits increment unless `isVisit === false` (`gamification.service.ts:188`), and a filled repeatable card issues a free voucher (`:205-207`, `:292-302`). `TransactionDto.amountMinor` may be 0 (`dto.ts:146-149`).
- **Impact:** A cashier can fill a 10-stamp card with ten `amountMinor: 0` earns and hand over the reward; no money moves, so nothing in settlement notices.
- **Fix:** Count a visit only when `amountMinor > 0` (or a brand-configured minimum) and dedupe visits per member per day. **Effort:** S.

### LEDGER-13 — Earn idempotency is per terminal and per client key; the same POS receipt can be earned twice
- **Severity:** Medium · **CVSS 3.1:** 4.3 (PR:H) · **Confidence:** Confirmed (code)
- **Location:** `terminal.service.ts:644-647`, `schema.prisma` `TerminalTransaction @@unique([actorId, idempotencyKey])`, `terminal-hmac.guard.ts:88` (`actor.id = key.terminalId ?? key.id`)
- **Evidence:** Dedupe key is `(terminalId, idempotencyKey)`; the key is a device UUID (`TerminalApi.kt:354`). There is no uniqueness on `(brandId, orderNo)`/ECR voucher number for earns, so (a) a new UUID for the same sale, (b) the same sale posted from two terminals, or (c) posting after an ECR void all earn again. `/receipts` is idempotent by token but never earns (display only, `terminal.service.ts:269-420`); its `earnedPoints`/`balanceAfter` are client-asserted.
- **Impact:** Cashier-side double earning limited only by honesty; no reconciliation ties earns to payment references.
- **Fix:** Require `sourceEvent` = ECR order/voucher number and add a unique partial index `(brand_id, source_event) WHERE intent='earn'`; reconcile earns against receipts nightly. **Effort:** S.

### LEDGER-14 — Terminal `amountMinor` is trusted with no upper bound; a single earn can post up to ~9.2e18 points
- **Severity:** Medium · **CVSS 3.1:** 4.3 (PR:H) · **Confidence:** Likely
- **Location:** `dto.ts:146-149` (`@IsInt() @Min(0)` only), `rules.ts:225-227`, `loyalty.service.ts:270`
- **Evidence:** `Number.isInteger(1e20)` is true, so `amountMinor: 1e20` passes validation; `Math.floor(1e20/100)*1 = 1e18` points; `BigInt(1e18)` fits `bigint`. Only a brand rule with a `cap` action limits it (`rules.ts:244-246`); no brand-level or platform-level ceiling exists.
- **Fix:** Platform max per earn (e.g. `amountMinor <= 10_000_000`), per-member daily cap, anomaly alert via outbox. **Effort:** S.

### LEDGER-15 — No reconciliation job or report; the only invariant test is Σ entries = 0
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `packages/db/test/ledger.test.ts:318-323` (global imbalance check); no job in `workers/`; no report in `reporting/`
- **Evidence:** Nothing compares `account_balance` with `entry`, pending holds with open authorizations, or brand liability with expense/revenue/breakage. The PoC's reconciliation query (below) found the LEDGER-03 drift immediately; production has no equivalent.
- **Fix:** Nightly job running the SQL in "Reconciliation proof", emitting an outbox alert on any row; expose in the superadmin console. **Effort:** M.

### LEDGER-16 — `issueVoucherForCustomer` creates value with no points, no cap, no dual control
- **Severity:** Medium (insider) · **Confidence:** Confirmed
- **Location:** `superadmin.service.ts:796-837`, `superadmin.controller.ts:211-216`
- **Evidence:** `pointsSpent: 0n // gifted, not purchased` (`:820`); any `platform.manage` holder, any brand, any catalogue item, no daily/value cap, `reason` optional (`:830`); governance `ChangeRequest` flow is not involved. It is audited (`:825-831`), which is the only control.
- **Impact:** One superadmin account issues unlimited AED-valued vouchers to any membership (including their own).
- **Fix:** Route through governance approval above a value threshold, require `reason`, cap per actor per day, and post a `points_expense`-style journal (`kind: adjust`, zero-points voucher with `valueMinor`) so gifted value appears in the ledger. **Effort:** M.

### LEDGER-17 — Group-wallet top-up has no audit record and no payment reference (also part of LEDGER-06)
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `superadmin.service.ts:1206-1214`, `operations.ts:604-629`
- **Evidence:** The only trace is the `topup` journal with `sourceEvent` null; `TopUpDto` carries `amountMinor`, `currency`, `idempotencyKey` only (`superadmin.controller.ts:278`). `requestHash` is `['topup', groupId, amount]` (`operations.ts:607`), so the same key with a different amount is a conflict but a new key is a new top-up.
- **Fix:** Mandatory `paymentRef`, `audit.record`, and a governance change-request. **Effort:** S.

### LEDGER-18 — Audit hash chain is forkable, scope-relative, and never verified
- **Severity:** Medium · **Confidence:** Confirmed
- **Location:** `apps/api/src/platform-core/audit/audit.service.ts:26-49`; grep for `prevHash`/verify
- **Evidence:** `prev = findFirst({ orderBy: { createdAt: 'desc' } })` with no lock (`:27`); two concurrent writers read the same `prev` and both chain to it (fork). Under RLS the "previous" row is the previous *visible* row, so the chain is per-tenant-scope and not globally verifiable. No code reads `prevHash` to verify. Positive: `audit_log` has a `no_mutation` trigger (`rls.sql:233-236`), so rows cannot be edited or deleted by `loyalty_app`.
- **Fix:** Serialise with `pg_advisory_xact_lock` per platform, chain on a monotonic sequence, add a `verify-audit-chain` script/endpoint. **Effort:** S.

### LEDGER-19 — Membership-card load/spend (uncommitted): `amountPaidMinor` is unvalidated and un-reconciled; spend has no branch allow-list
- **Severity:** Medium (design, not yet reachable) · **Confidence:** Confirmed (code)
- **Location:** `packages/db/src/ledger/operations.ts:404-582` (working tree), `2026-08-06_membership_load_spend.sql`
- **Evidence:** `loadPoints` accepts any `amountPaidMinor` (including 0) and only stores it in the idempotency response (`:493-496`), not on the journal or an entry; there is no `cash_clearing` leg, so "how much did the counter take" cannot be answered from the ledger despite the migration comment claiming it. `spendPoints` is single-step with the `applyPosted` guard (good) but nothing restricts which branch/terminal may spend. Neither is wired into `TerminalService` yet (`TxnInput.intent` is `'earn' | 'redeem'`, `terminal.service.ts:17`).
- **Fix:** Post the cash side (`cash_clearing` debit / `points_sold` credit in the money ledger, or at least `amountPaidMinor` on `journal.source_event`), require `amountPaidMinor > 0` and a payment reference, reuse LEDGER-13's uniqueness, and reconcile loads against ECR totals. **Effort:** M.

### LEDGER-20 — `confirmVoucherHolds`/`voidTxn` act on every reserved voucher for the member, not the one on this sale
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `terminal.service.ts:102-112`, `:660`, `:812-815`
- **Evidence:** Both use `updateMany({ brandId, membershipId, status: 'reserved' })`. An earn at terminal B marks a voucher reserved at terminal A as redeemed; a void at A releases a hold held at B.
- **Fix:** Store `terminalTransactionId` on the voucher reservation. **Effort:** S.

### LEDGER-21 — HMAC nonce store is per-instance; replay protection is 50% effective with 2 instances
- **Severity:** Low (in this domain; app-level idempotency neutralises the money impact) · **Confidence:** Confirmed
- **Location:** `auth/nonce-store.service.ts:9-24`, `terminal-hmac.guard.ts:74-78`
- **Evidence:** Replaying a signed `/transactions` body to the other instance within the 300 s skew hits `(actorId, idempotencyKey)` and returns the same row (`terminal.service.ts:644-647`); capture/void are state-checked; `/receipts` is token-idempotent; `/vouchers/redeem` re-reserve is rejected while the hold is live. No double earn found. Residual: `/members/enroll` and `/quotes` replays are harmless.
- **Fix:** Redis `SET NX EX` as the TODO says. **Effort:** S.

### LEDGER-22 — In-app `redeem` with a reused key and a different item returns 500 (`idempotency_conflict` not mapped)
- **Severity:** Low · **Confidence:** Confirmed (code)
- **Location:** `loyalty.service.ts:932-937` maps only `insufficient_balance`; `reserveIdempotency` throws `idempotency_conflict` (`engine.ts:287-289`).
- **Fix:** Map to 409. **Effort:** S.

### LEDGER-23 — Tier `multiplierBps` is advertised to customers but never applied by the engine
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `loyalty.service.ts:819-828` (shown as "earn 1.5× points"), `rules.ts:191-265` (no tier multiplier), `loyalty.service.ts:254-257` (only `profile.tier` name passed)
- **Impact:** Customer-facing promise with no ledger effect unless a brand hand-writes a rule per tier.

### LEDGER-24 — Pending holds defer expiry; `expiring()` and the sweep disagree on timing
- **Severity:** Low · **Confidence:** Confirmed
- **Location:** `expiry-sweep.service.ts:37-39` (cap at `available`, which excludes pending), `loyalty.service.ts:171-173` (treats pending as spent)
- **Evidence (worked example):** 100 pts in an expired bucket, 0 live, 100 held by an open authorisation at sweep time → `available = 0`, nothing expires; if the hold is voided the points are live again until the next hourly pass. The app's `expiring()` would have told the customer they had 0 expiring. Minor, self-healing.

### LEDGER-25 — Expiry formula is exact under its own FIFO assumption (no over/under-expiry found) — Info
- Worked examples against `toExpire = min(available, earned_expired − posted_debits)` (`expiry-sweep.service.ts:37-38`):
  - Earned 100 (expired bucket) + 200 (live), redeemed 150 → `100 − 150 < 0` → expire 0. FIFO expected 0. ✔
  - Same, redeemed 0 → expire 100; `available = 300` → 100. ✔
  - Month 1 earn 100 (A), A expires (debit 100); month 2 earn 200 (B), redeem 150; B expires → `300 − 250 = 50`, `available = 50` → 50. ✔ (B had 200, 150 spent, 50 lapse.)
  - Null-bucket credits (adjust/load without expiry) are consumed last in both `expiring()` and the sweep. ✔
  The only divergence from a true lot ledger is ordering by expiry bucket rather than earn time, which is the documented policy. Concurrency (LEDGER-04) is the real defect.

### LEDGER-26 — `CostRule.issuanceFeeMinor` and `breakageOwner` are stored but never applied — Info
- Grep shows both only in DTO/serialisation (`superadmin.service.ts:234-236`, `:1196-1198`, `:1227`). Breakage income always lands in a brand-scoped `breakage_income` account; platform/split ownership is not implemented; issuance fees are never charged.

### LEDGER-27 — Account deletion does not enable join-bonus or referral farming — Info (positive)
- There is no join bonus (`wallet_join_brand` creates only membership + identifiers, `2026-07-28_wallet_join_brand.sql:45-67`; `sendWelcome` is email only). `sweep_account_deletions` keeps `phone_hash` (`2026-08-05_account_deletion.sql:106-113`), so re-signup resolves the same archived person and `wallet_join_brand` re-activates the same membership with its existing balance. Referral farming (LEDGER-01) needs no deletion.

### LEDGER-28 — Numeric handling is integer-safe end to end — Info (positive)
- Money/points are `bigint` in the engine and `BigInt` columns; DTOs enforce `@IsInt() @Min(0|1)`; `redemptionValueMinor` and `redemptionPointsForValue` use `bigint` floor/ceiling division (`loyalty.service.ts:1011-1029`); `drawdownWallet` fee is `(cost × bps) / 10000n` integer floor (`operations.ts:665-667`); rules engine `Math.floor` on the final product (`rules.ts:251`). `pointsPerUnit` may be a float but the result is floored before `BigInt`. Currency is not checked between brand and terminal receipt (display only).

---

## Reconciliation proof

### Invariants enforced by the database (hold today)
| Invariant | Enforcement | Evidence |
|---|---|---|
| Every journal with entries balances per asset (Σdebit = Σcredit, one asset) | `journal_balanced` deferred constraint trigger | `ledger.sql:31-58`; ledger test "rejects an unbalanced journal" passes |
| Entry amounts > 0 | `entry_amount_positive` CHECK | `ledger.sql:61-62` |
| Journals/entries are append-only | `no_mutation` BEFORE UPDATE/DELETE triggers | `ledger.sql:20-28` |
| Credit-normal accounts never go available-negative | `account_balance_non_negative` CHECK **plus** guarded UPDATEs | `ledger.sql:66-70`, `engine.ts:128-135`, `:149-156` |
| One account per identity | `uq_ledger_account_identity` | `ledger.sql:73-76` |
| Idempotency key unique per actor | `@@unique([actorId, key])` | `schema.prisma` IdempotencyKey |
| Terminal txn unique per terminal + key | `@@unique([actorId, idempotencyKey])` | `schema.prisma` TerminalTransaction |
| Audit log append-only | `no_mutation` trigger | `rls.sql:233-236` |

### Invariants enforced only by application code
| Invariant | Where | Weakness |
|---|---|---|
| `account_balance.posted_* = Σ entries` | `applyPosted` / `captureHold` + `creditAccount` with `applyBalances:false` | No trigger; any direct SQL or a future `applyBalances:false` misuse drifts silently; no job checks it (LEDGER-15) |
| `pending_debits = Σ open holds` | `holdPending` / `captureHold` / `releasePending` | `releasePending` unguarded → negative (LEDGER-03) |
| Terminal state machine `pending→authorized→captured|voided` | `capture`/`voidTxn` `findFirst` + unconditional `update` | Not conditional on current state (LEDGER-03); `expired`/`reversed`/`failed` states never set |
| One voucher per reward redemption | none | LEDGER-02 |
| Referral paid once per referee | none | LEDGER-01 |
| Expiry posted once per bucket | "debit makes re-run idempotent" | True sequentially only (LEDGER-04) |
| Settlement once per captured txn | `settledAt` + idem key `settle:<id>` in one tx | Correct; but `cpp = 0` short-circuits without a journal (LEDGER-09) |
| Coupon ≤ maxRedemptions | read-then-increment | LEDGER-11 |
| Allowance wallet ≥ 0 | read-then-decrement | LEDGER-08 |

### Invariants NOT enforced anywhere
- `pending_debits >= 0`.
- Brand liability equation: Σ liability(credit bal) = Σ(points_expense + points_sold debit bal) − Σ(points_revenue + breakage_income credit bal) per asset. (Holds today only because every mutator is double-entry; nothing checks it.)
- Earn ↔ payment reference uniqueness (LEDGER-13).
- Voucher `redeemJournalId` uniqueness (LEDGER-02).
- Group wallet top-up ↔ payment received (LEDGER-06/17).
- Any relationship between `receipt.earned_points/balance_after` and the ledger (client-asserted).

### SQL that would reconcile (run nightly; every row returned is an incident)

```sql
-- 1. Materialised balance vs entries, and negative holds
SELECT ab.account_id, la.account_type, la.brand_id, la.customer_id,
       ab.posted_credits, ab.posted_debits, ab.pending_debits,
       coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='credit'),0) AS entry_credits,
       coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='debit'),0)  AS entry_debits
  FROM account_balance ab
  JOIN ledger_account la ON la.id = ab.account_id
  LEFT JOIN entry e ON e.account_id = ab.account_id
 GROUP BY ab.account_id, la.account_type, la.brand_id, la.customer_id,
          ab.posted_credits, ab.posted_debits, ab.pending_debits
HAVING ab.posted_credits <> coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='credit'),0)
    OR ab.posted_debits  <> coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='debit'),0)
    OR ab.pending_debits < 0;

-- 2. Journal-level balance (should be exactly zero rows)
SELECT journal_id, sum(CASE WHEN direction='debit' THEN amount_minor ELSE -amount_minor END) AS imbalance
  FROM entry GROUP BY journal_id HAVING sum(CASE WHEN direction='debit' THEN amount_minor ELSE -amount_minor END) <> 0;

-- 3. Open holds vs pending_debits, per brand
SELECT la.brand_id,
       sum(ab.pending_debits) AS pending,
       (SELECT coalesce(sum(t.points),0) FROM terminal_transaction t
         WHERE t.brand_id = la.brand_id AND t.intent='redeem' AND t.state='authorized')
     + (SELECT coalesce(sum(c.source_points),0) FROM conversion c
         WHERE c.brand_id = la.brand_id AND c.status='pending') AS open_holds
  FROM ledger_account la JOIN account_balance ab ON ab.account_id = la.id
 WHERE la.account_type = 'points_liability'
 GROUP BY la.brand_id
HAVING sum(ab.pending_debits) <> (SELECT coalesce(sum(t.points),0) FROM terminal_transaction t
         WHERE t.brand_id = la.brand_id AND t.intent='redeem' AND t.state='authorized')
     + (SELECT coalesce(sum(c.source_points),0) FROM conversion c
         WHERE c.brand_id = la.brand_id AND c.status='pending');

-- 4. Brand liability equation per points asset
SELECT la.asset_code,
       sum(CASE WHEN la.account_type='points_liability' THEN ab.posted_credits-ab.posted_debits ELSE 0 END) AS liability,
       sum(CASE WHEN la.account_type IN ('points_expense','points_sold') THEN ab.posted_debits-ab.posted_credits ELSE 0 END)
     - sum(CASE WHEN la.account_type IN ('points_revenue','breakage_income') THEN ab.posted_credits-ab.posted_debits ELSE 0 END) AS contra
  FROM ledger_account la JOIN account_balance ab ON ab.account_id = la.id
 WHERE la.ledger='points'
 GROUP BY la.asset_code
HAVING sum(CASE WHEN la.account_type='points_liability' THEN ab.posted_credits-ab.posted_debits ELSE 0 END)
    <> sum(CASE WHEN la.account_type IN ('points_expense','points_sold') THEN ab.posted_debits-ab.posted_credits ELSE 0 END)
     - sum(CASE WHEN la.account_type IN ('points_revenue','breakage_income') THEN ab.posted_credits-ab.posted_debits ELSE 0 END);

-- 5. Vouchers: more than one voucher per redeem journal, or pointsSpent with no journal
SELECT redeem_journal_id, count(*) FROM voucher WHERE redeem_journal_id IS NOT NULL
 GROUP BY redeem_journal_id HAVING count(*) > 1;
SELECT id FROM voucher WHERE points_spent > 0 AND redeem_journal_id IS NULL;

-- 6. Captured redemptions settled without a drawdown journal (free settlement)
SELECT id, group_id, points, settled_at FROM terminal_transaction
 WHERE intent='redeem' AND state='captured' AND settled_at IS NOT NULL AND drawdown_journal_id IS NULL;

-- 7. Captured-but-unsettled older than 1 hour (wallet shortfall / worker dead)
SELECT group_id, count(*), sum(points) FROM terminal_transaction
 WHERE intent='redeem' AND state='captured' AND settled_at IS NULL AND updated_at < now() - interval '1 hour'
 GROUP BY group_id;

-- 8. Referral abuse
SELECT referee_membership_id, count(*) FROM referral WHERE referee_membership_id IS NOT NULL
 GROUP BY referee_membership_id HAVING count(*) > 1;
```

**Do current tests prove reconciliation?** No. `ledger.test.ts` proves single-row overdraw protection, idempotent replay of the same engine call, journal balancing, and one concurrency case (10 authorisations). It never asserts `account_balance = Σ entries`, never exercises capture∥void, concurrent sweeps, service-level replay, or any flow above the engine. `terminal.e2e.test.ts` covers the happy path and one earn replay. The PoC's query 1 found drift in under a second.

---

## Not assessed
- RLS correctness and the `wallet_*` SECURITY DEFINER functions (audit 02/09).
- HMAC signature construction, key storage, JWT secrets (audit 01/03).
- Apple/Google pass issuance, PassKit endpoints, receipt-public pages beyond the client-asserted points fields.
- Webhook/outbox delivery semantics (only noted that no low-balance/reconciliation events exist).
- The terminal app's ECR/payment flow beyond confirming the refund path makes no loyalty call.
- Supabase/Supavisor transaction-pooler interaction with `set_config(... , true)` and interactive transactions (audit 07/09); if the pooler ever splits a `tenants.run` across connections, every "same tx" guarantee in this report is void.
- Production data: no query was run against Supabase; drift may already exist there.

## Positive controls verified
- Guarded conditional updates (`available >= amount`) make overdraw impossible for debits/holds on credit-normal accounts; 10-way and 8-way concurrency tests pass (`ledger.test.ts`, `spendPoints` tests in the working tree).
- `journal_balanced` deferred trigger rejects unbalanced or mixed-asset journals at commit (observed in the test log: `journal … is unbalanced (imbalance=100)`).
- Journals, entries and audit rows are append-only via triggers; `loyalty_app` cannot drop them.
- Idempotency key reserve, ledger post and `completeIdempotency` happen in one transaction; a crash rolls back the key (no "key without journal"). `reserveIdempotency` rejects key reuse with a different request hash.
- `loadPoints`/`spendPoints` validate amount before reserving the key (`operations.ts:56-58`); sequential replay of load/earn/authorize/capture/void is idempotent.
- Settlement idempotent per transaction (`settledAt` + `drawdownJournalId` set in the same tx as the drawdown; idem key `settle:<id>`); concurrent settlement serialises on the idempotency unique index.
- Terminal earn replay via `/transactions` and `/transactions/batch` returns the original transaction (e2e tests + PoC seed steps); HMAC nonce replay across instances is therefore money-neutral.
- Voucher redemption at the till is a hold confirmed on capture/earn and auto-released after 15 min; one reward per sale enforced; superadmin cancel works on `issued`/`reserved`.
- `deleteBranch`/`deleteTerminal` refuse when transaction history exists.
- Redemption valuation helpers are integer `bigint` and round down; drawdown fee math is integer.
- No join bonus exists, and account deletion keeps `phone_hash`, so deletion/re-signup cannot farm value.
- `adjustPoints` (unused) clamps debits to available and records a reason on the journal; it is the right building block for LEDGER-05 once wired.
