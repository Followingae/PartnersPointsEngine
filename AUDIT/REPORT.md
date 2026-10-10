# RFM Loyalty Engine — Pre-Production Security & Readiness Audit

Date: 2026-10-10 · Branch `main` @ afc3fe2 plus an uncommitted membership-card working tree · Scope: merchant console, superadmin console, customer app, terminal app, and the shared NestJS API + Postgres backend · Method: 13 parallel specialist audits over a mapped system (`AUDIT/00_system_map.md`), then independent red-team verification with a reproduced ledger proof-of-concept (`AUDIT/14_redteam_verification.md`, `AUDIT/poc/ledger_poc.ts`) · Read-only: no source changed, no production system touched.

---

## 1. Verdict: NO-GO

Do not launch. Verification confirmed money can be minted from nothing by any customer and redeemed at the till with no detection, the terminal fleet's signing identity is in a public repository, the background job subsystem does not run in its secure configuration, and the database owner credential is on the live request path behind row-level security that is only enabled, not forced. These are not hardening gaps; several are reproduced exploits.

The findings are real regardless of one unknown that only a production query can settle: whether the restricted database role is actually configured. That unknown does not change the verdict, because every branch of it is a blocker. It changes only *which* blocker.

**Exact blockers (all must clear before reconsidering):**

| # | Blocker | Evidence |
|---|---|---|
| B1 | Customer-reachable point minting: referral ping-pong and reward-redeem replay, both PoC-reproduced | C2, C3 |
| B2 | Redemption has no bill cap or minimum and the server valuation is advisory; capture/void race drives the ledger negative | H9, C4 |
| B3 | Terminal fleet signing keystore and its plaintext passwords are committed to a repository reported public | C1, SC-01/02 |
| B4 | Background subsystem is broken in both possible configs: workers never run under RLS, or RLS is off entirely | H7, C8, H16, H26 |
| B5 | Database owner credential used on every auth and terminal request; RLS ENABLE not FORCE; `APP_DATABASE_URL` optional | H16, H26 |
| B6 | PII master key silently falls back to a hard-coded string that is now public | H17, SC-03 |
| B7 | Account deletion does not delete and a deleted person resurrects with their old balance; card data logged and published on an unauthenticated receipt | C5, C6 |
| B8 | Seeded admin credentials with no MFA and no password-change path; MFA optional for superadmin | C7, H6 |
| B9 | No metrics, alerts, or log destination: the platform cannot detect its own failure | C9 |
| B10 | Push to `main` deploys to production and runs migrations with no gate, through CI that is admitted to be permanently red | H19, H33 |

---

## 2. Findings, deduplicated and ranked

Severity is the post-verification consensus. "IDs" lists every agent that reported the same underlying issue. Full detail is in the per-domain reports `01`–`13` and the verdict in `14`.

### Critical

| Title | Severity | Verified | Contributing IDs |
|---|---|---|---|
| Point minting from the customer app (referral loop + reward-redeem replay) | Critical | PoC | C2/LEDGER-01, C3/LEDGER-02 |
| Public repo carries the live Android fleet signing keystore + passwords → fleet code execution | Critical | Confirmed | C1, SC-01, SC-02, MOBILE-01 |
| Background subsystem non-functional under RLS, or RLS bypassed entirely (worker queries set no tenant context) | Critical | Confirmed | H7, DB-01, AUTHZ-05, C8/LEDGER-04 |
| DB owner credential on the request path + RLS ENABLE-not-FORCE + optional `APP_DATABASE_URL` | Critical | Confirmed | H16/INFRA-01, H26/SRE-12 |
| PII master key silent fallback to a public hard-coded key | Critical | Confirmed | H17/INFRA-02, SC-03, PRIV-07 |
| Capture∥void race → negative pending_debits, permanent ledger drift | Critical | PoC | C4/LEDGER-03, DB-02 |
| Account "deletion" leaves identity and resurrects balance; no real erasure | Critical | Confirmed | C5/PRIV-01, AUTHZ-11, PRIV-03 |
| Card data (PAN/EMV) logged on-device and unvalidated maskedPan/authNo served on the unauthenticated public receipt | Critical | Confirmed (PAN caveat) | C6/PRIV-02, PRIV-06, MOBILE-09 |
| No metrics, alerts, or log shipping | Critical | Confirmed | C9/SRE-01 |
| Seeded admin creds + no MFA + no password-change path (if seed ran in prod) | Critical (conditional) | Confirmed | C7/AUTHZ-01, FE-02, INFRA-04 |

### High

| Title | Severity | Verified | Contributing IDs |
|---|---|---|---|
| Redemption ignores bill cap/minimum; device decides AED value | High | PoC | H9/LEDGER-07 |
| Rate limiter keys on load-balancer IP → platform-wide OTP/login lockout | High | Confirmed | H1, APPSEC-01, API-01, AUTHZ-04, INFRA-03 |
| group_admin can self-fund its wallet and zero its cost rule | High | Confirmed (audit-row qualifier) | H5/AUTHZ-02, LEDGER-06 |
| MFA optional for all admins; enrol endpoint silently disables an enrolled factor; no console MFA UI | High | Confirmed | H6/AUTHZ-03, FE-01 |
| No points clawback on refund/void; no adjustment path at all | High | Confirmed | H8/LEDGER-05 |
| Partner (Lulu) conversion always uses the stub → points burned for a phantom credit | High | Confirmed | H10/LEDGER-08 |
| Settlement charges nothing when cost rule is 0/absent; failures swallowed; backlog starves | High | Confirmed | H11/LEDGER-09, SRE-04 |
| Webhook SSRF via the test endpoint (no scheme/IP filter, no timeout, status oracle) | High | Confirmed | H3/API-02, APPSEC-03 |
| ReDoS in the earn-rule `matches` operator inside the earn transaction | High | Reproduced | H2/APPSEC-02 |
| Change-request maker-checker bypasses DTO validation | High | Confirmed | H4/API-03 |
| Customer app stores 30-day refresh token in plaintext; sign-out never revokes | High | Confirmed | H12/MOBILE-02 |
| Default terminal PIN 4321; demo mode posts real earns/captures with no server marker | High | Confirmed | H13/MOBILE-03 |
| EAS OTA updates unsigned → Expo compromise pushes JS to every app | High | Confirmed | H14/MOBILE-04, SC-11 |
| Static phone/QR authorizes and captures redemption with no customer confirmation | High | Confirmed | H15/MOBILE-05 |
| Suspending a merchant/terminal does not stop its HMAC key | High | Confirmed | H20/SRE-05, AUTHZ-10 |
| Jobs container claims customer alerts it cannot send → ~1/3 lost | High | Confirmed | H21/SRE-03 |
| Webhook relay steals <20s alerts + subscription names never match emitted events | High | Confirmed (new) | H36/PERF-11, SRE-17 |
| `/health` returns 200 with the DB down | High | Confirmed | H22/SRE-02 |
| No outbound HTTP timeouts → one hung provider stalls a worker ~5 min for all brands | High | Confirmed | H23/SRE-07, PERF-04 |
| Authorized redemption holds never expire server-side | High | Confirmed | H24/SRE-08 |
| No graceful shutdown; deploys cut in-flight requests | High | Confirmed | H25/SRE-11 |
| terminal_release RLS GUC misspelled + FORCE → OTA release console broken under RLS | High | Confirmed | H27/DB-03, AUTHZ-12 |
| Read-only/support roles see decrypted customer PII platform-wide; no read audit | High | Confirmed (search qualifier) | H30/PRIV-08, API-05, AUTHZ-07 |
| No consent captured anywhere; app privacy toggles are local-only | High | Confirmed | H29/PRIV-04, PRIV-05 |
| No data retention; `otp_prune` never called; no purge for refresh/outbox/webhook/idempotency | High | Confirmed | H31/PRIV-09 |
| `next@15.5.19` behind the patched line (incl. an image-optimizer RCE advisory) | High | Confirmed (reachability open) | H18/FE-07, SC-04 |
| deploy_on_push to prod through permanently-red CI; untracked migration listed in migrations.ts | High | Confirmed | H19/SRE-09, SC-05, H33/CQ-03 |
| Exception filter maps only HttpException → LedgerError/ZodError/P2002 become 500 | High | Confirmed | H34/CQ-05 |
| No HTTP-level tests; API/ledger e2e run as DB owner (RLS not exercised on worker/H27 paths) | High | Confirmed (RLS-suite qualifier) | H32/CQ-01, CQ-02 |
| Performance cluster: expiry O(all entries) in a 5s tx; missing ledger/settlement indexes; live analytics scans; unbounded refresh_token growth | High | Confirmed (5/6) | H35/PERF-02/03/05/06/07/09 |

Medium, Low and Info findings (approximately 110 more) are itemised in the domain reports; the material ones feed the 30-day list in section 5.

---

## 3. Top 10 fixes, in order

| # | Fix | Owner role | Effort |
|---|---|---|---|
| 1 | Make the repo private; rotate the Android signing key via v3 lineage rotation and plan a signed fleet re-pair; purge the keystore and passwords from history; rotate every secret the PII dev-key may have wrapped | Platform eng + mobile lead | L |
| 2 | Close the point-minting paths: one lifetime referral code per referrer with a new-member check and cap; make the voucher part of the redeem idempotency unit; guard `releasePending` and make terminal state transitions conditional with a `pending_debits >= 0` CHECK | Backend/ledger | M |
| 3 | Enforce server-owned redemption valuation: reject device-supplied point/AED values, apply the bill minimum and cap server-side, add a server hold TTL | Backend/ledger | M |
| 4 | Set the runtime DB role correctly and prove it: make `APP_DATABASE_URL` required, assert a non-owner non-bypassrls role at boot, FORCE RLS, move migrations to a pre-deploy job so the request path never holds the owner credential; give `perBrand`/`perGroup` a definer enumerator so workers run | Backend + infra | M |
| 5 | Validate `PII_MASTER_KEY_BASE64` at boot and remove the hard-coded fallback; move to a managed KMS; refuse to start without a valid 32-byte key | Infra | M |
| 6 | Make deletion delete: null the phone/email hashes, remove identifiers, revoke refresh tokens, and reject archived persons on every re-entry path; stop logging card data on the terminal and validate/strip `maskedPan`/`authNo`; confirm the PAN masking contract with Feitian | Backend + mobile + privacy | M |
| 7 | Remove the seeded admins from prod (verify first), add a `NODE_ENV=production` seed guard, ship a password-change/reset flow, and make MFA mandatory for platform roles with a real console UI; re-auth the MFA enrol endpoint | Backend + frontend | M |
| 8 | Add observability: metrics, DO alert rules, external pager, and log shipping; make `/health` check the DB and wire `/ready`; enforce group-wallet low-balance and settlement-failure alerts | SRE | M |
| 9 | Gate deployment: branch protection with required green CI, no deploy_on_push without an approval, fix the red CI, and never ship a migrations-list change without its SQL file | SRE + eng lead | S |
| 10 | Set `trust proxy`, move throttling + the HMAC nonce store to shared Redis, add per-phone OTP limits and a country allowlist, filter webhook URLs and add outbound timeouts, and upgrade Next.js past 15.5.27 | Backend | M |

---

## 4. Pre-launch checklist (must be done and verified before go-live)

- [ ] Repo private; signing key rotated; history purged; all possibly-wrapped secrets rotated (JWT, terminal HMAC, webhook, PII key, Twilio, Resend, Apple/Google).
- [ ] Production DB role confirmed non-owner, non-bypassrls, RLS FORCED; migrations run as a separate pre-deploy step; boot asserts the role.
- [ ] `APP_DATABASE_URL`, `PII_MASTER_KEY_BASE64` (valid 32 bytes), `CORS_ORIGINS`, and the Twilio/Apple/Google vars present and validated; API refuses to boot otherwise.
- [ ] Point-minting fixes merged with regression tests: referral cap, voucher idempotency, capture/void guard + CHECK, server-owned redemption valuation, hold TTL.
- [ ] Workers proven to run in the secure role (settlement, expiry, webhooks, deletions) with leader election or row-claiming; double-expiry impossible.
- [ ] Seeded admins absent from prod; password-change/reset shipped; MFA mandatory for platform roles and usable in both consoles.
- [ ] Deletion verified to erase identity and prevent balance resurrection; DSAR export/erase scoped correctly; retention jobs running.
- [ ] No card data in terminal logs; `maskedPan`/`authNo` validated to last-4; public receipt reviewed; PAN contract confirmed with Feitian; PCI scope documented.
- [ ] Observability live: metrics, alerts, pager, log shipping; `/health` DB-aware; `/ready` wired; settlement-failure and low-balance alerts firing.
- [ ] Deploy gated behind green CI and approval; CI green; terminal-release publish path fixed (H27) and signature-verified server-side.
- [ ] `trust proxy` set; throttler + nonce store on shared Redis; per-phone OTP limits; webhook URL filtering + outbound timeouts; Next.js ≥ 15.5.27.
- [ ] Graceful shutdown (`enableShutdownHooks` + SIGTERM) so deploys don't cut in-flight ledger work.
- [ ] A reconciliation job runs and the 8 SQL invariant checks in `04_ledger_fraud.md` pass on seeded data.
- [ ] `.dockerignore` added so `.env`/`secrets/`/keystore never enter an image layer; the two DigitalOcean tokens in the local settings file checked and rotated.

## 5. 30-day post-launch hardening

- Reconciliation and anomaly alerting on earn/burn velocity, breakage, and group-wallet drawdown; a fraud-freeze switch that propagates to the HMAC guard immediately (fixes H20).
- Suspension/status enforced on every terminal request; webhook subscription event names aligned to emitted types; webhook relay row-claiming and ordering.
- Lulu connector implemented and gated by `connectorMode`, with compensation outside the DB transaction.
- Full data map / RoPA, DPAs for all processors, cross-border transfer basis, retention schedule, consent capture at enrolment and in-app, age gate on birthdate.
- Secret rotation schedule and KMS-backed per-record data keys; dependency SCA + secret scanning + CodeQL in CI; SBOM.
- Performance: schedule the daily rollup/RFM jobs, add the missing indexes, batch the expiry sweep, cache terminal `/config` and the pass/receipt renders, bound all list endpoints.
- HTTP-level and negative test coverage for auth, RBAC denials, HMAC, cross-tenant writes, and ledger state machines; run the API e2e suite as the non-owner role.
- DR: confirm Supabase PITR tier, run a restore drill, document RTO/RPO and the six runbooks (deploy rollback, DB restore, key rotation, Twilio outage, bad terminal release rollback, fraud freeze).
- Replace in-memory throttle/nonce state; add tracing; define SLOs for the terminal, app, and console paths.

## 6. Not assessed — and the access each needs

| Gap | Access needed to close it |
|---|---|
| Whether `APP_DATABASE_URL`/the non-owner role is live in prod (decides B4/B5 branch, H27 liveness) | One read-only prod query: `select current_user, rolbypassrls from pg_roles where rolname=current_user` |
| Whether the seed ran against prod (decides C7 severity) | Query `user_account` for `admin@%.dev` / `superadmin@rfm-loyalty.dev` |
| Whether the GitHub repo is currently public (decides C1 blast radius) | GitHub repo settings (supply-chain agent reported public via unauthenticated fetch) |
| Whether SmartPay returns full or masked PAN (decides C6/PCI scope) | Feitian ECR integration spec or a captured terminal response |
| Live `CORS_ORIGINS` / `API_DOCS_ENABLED` values | DigitalOcean app environment |
| Next.js image-optimizer reachability on Vercel | Vercel project config / a probe of `/_next/image` |
| Supabase PITR tier, backup/restore, network exposure, PostgREST Data API status on the non-RLS tables | Supabase project dashboard |
| Vercel deployment protection / preview exposure of the superadmin console | Vercel project settings |
| Runtime load/timing behaviour (all perf numbers are estimates from query shape) | A staging environment and the k6 plan in `11_performance.md` |

---

Supporting material: `00_system_map.md` (system map), `01`–`13` (domain reports), `14_redteam_verification.md` (per-claim verdicts + attack chain), `poc/ledger_poc.ts` (reproducible money-flow PoC), `poc/redteam_brief.md` (the claim set handed to the red team).
