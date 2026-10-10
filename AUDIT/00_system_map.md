# 00 — System Map (Phase 1 Recon)

Audit date: 2026-10-10. Branch `main` @ afc3fe2 (+ uncommitted working-tree changes in ledger/loyalty/superadmin/schema for the membership-card load/spend feature). Read-only audit; no code changes, no production access.

## 1. Repository & tooling

| Item | Value |
|---|---|
| Monorepo | pnpm 10.29.3 workspaces + Turborepo 2.x, Node >= 22, TypeScript 5.8 |
| Packages | `apps/api` (NestJS 11, Express, Prisma), `apps/web-brand` (Next 15, merchant console), `apps/web-superadmin` (Next 15, internal console), `apps/docs` (Next 15 developer portal, cookie-gated), `apps/mobile` (Expo 54 / RN 0.81 / expo-router 6, customer app), `apps/terminal-android` (Kotlin, Feitian SmartPay POS app), `packages/db` (Prisma schema + raw SQL migrations + ledger engine), `packages/shared` (zod enums, rules engine), `packages/sdk-terminal` (HMAC client), `packages/config` |
| DB | Postgres (Supabase in prod, pooled via Supavisor transaction mode on :6543; `DIRECT_URL` :5432 for migrations). Local dev: embedded-postgres via `pnpm db:dev` (`packages/db/scripts/dev-db.ts`, user/pass postgres/postgres, data in `packages/db/.dev-pgdata`). |
| Migrations | Hand-written SQL in `packages/db/prisma/sql/*.sql` applied at API boot by `apps/api/src/platform-core/prisma/schema-migrator.ts` (list in `packages/db/src/migrations.ts`). Baseline `0001_baseline.sql`, `ledger.sql` (triggers/constraints), `rls.sql` (policies). Prisma Migrate is NOT used at runtime. Older duplicate SQL in `packages/db/migrations/`. |
| Queues | BullMQ is a dependency and `worker-scheduler.ts` creates a `rfm-maintenance` queue, but no processors consume it. Real background work is `setInterval` loops in `apps/api/src/modules/workers/worker-runner.service.ts` running on every API instance (txn-alerts 15s, webhooks 30s, settlement 60s, point-expiry 1h, account-deletions 1h). DO app spec still deploys a `jobs` worker with `ROLE=worker` (read only by `main.ts` to skip migrations). |
| Cache / rate limit | `@nestjs/throttler` in-memory (300 req/min default per IP; login/MFA 10/min; OTP 5/min; verify 10/min). Terminal and PassKit controllers `@SkipThrottle()`. Nonce store for HMAC replay is in-memory (`apps/api/src/auth/nonce-store.service.ts`), not Redis, so not shared across the 2 API instances. |
| Infra | API: DigitalOcean App Platform (`.do/app.yaml`, region fra, 2x basic-xs, Dockerfile `node:22-slim`). Consoles + docs: Vercel. DB: Supabase. Redis: DO Valkey (configured but effectively unused). No Terraform/IaC beyond `.do/app.yaml` + `vercel.json`. |
| CI | `.github/workflows/ci.yml`: build, typecheck, lint, apply schema+RLS to pg:16 service, RLS tests, rules tests, API e2e, prod-deps prune check, OpenAPI drift check, HTTP smoke. No SCA / secret scanning / SAST step. No deploy step (DO + Vercel deploy on push to `main`). |
| Third-party | Twilio (SMS/WhatsApp OTP + txn alerts: `auth/otp/sms-sender.service.ts`, `workers/txn-alert.service.ts`), Resend (email: `platform-core/email/email.service.ts`), Apple Wallet PassKit + APNs (`modules/wallet-pass/*`, cert/key material under `secrets/` locally), Google Wallet (`google-wallet.service.ts`, OAuth2 service account), Expo Updates (EAS projectId 58eef0fa...), Lulu partner connector (STUB ONLY: `partnerships/partner-connector.ts`). No payment processor: card payments happen on the Feitian terminal's payment app; the loyalty API receives amount + reference only. |
| Secrets on disk (local, gitignored) | `.env`, `.do-token`, `secrets/` (Apple pass signing p12/p8/pem, password file). GIT-TRACKED: `apps/terminal-android/keystore.properties` (plaintext store/key password) and `apps/terminal-android/keystore/rfmhub.keystore` (commit c3d32f4). The gitignore `*.keystore` rule was added after the fact and does not untrack them. Also check tracking of `apps/terminal-android/local.properties`, release APKs, `apps/mobile/dist/`. |

## 2. API surface (apps/api)

Global: prefix `/v1` (excluded: `health`, `ready`, `metrics`, `docs`, `docs-json`). Helmet default. CORS from `CORS_ORIGINS` env (reflects any origin + credentials when unset). `ValidationPipe({whitelist, transform, forbidNonWhitelisted})`. Swagger at `/docs` unless `NODE_ENV=production` without `API_DOCS_ENABLED`. BigInt serialised as string. `rawBody: true` for HMAC. Pino logger redacts `authorization`, `cookie`, `x-api-key`.

Route totals: 138 GET, 84 POST, 29 PATCH, 19 DELETE (~270 handlers).

| Controller (file) | Prefix | Guard | Notes |
|---|---|---|---|
| `auth/controllers/admin-auth.controller.ts` | `/v1/auth` | none on login/mfa/token/logout; `AdminJwtGuard` on mfa/enrol, mfa/confirm | email+argon2 password, TOTP MFA step, refresh rotation |
| `auth/controllers/customer-auth.controller.ts` | `/v1/customer/auth` | none | `otp` (5/min), `verify` (10/min), `wallet`, `refresh` (no throttle override) |
| `auth/controllers/diagnostics.controller.ts` | `/v1/{admin,customer,terminal}/diagnostics` | per-surface | whoami-style |
| `modules/superadmin/superadmin.controller.ts` | `/v1/admin/*` | AdminJwt + Permissions(`platform.*`, `group.wallet.manage`) | groups, brands, branches, terminals, terminal keys, vouchers issue/cancel, wallet top-up, cost rules, customers, audit logs, team invite/role, act-as (impersonation), terminal releases (APK publish) |
| `modules/governance/superadmin-governance.controller.ts` | `/v1/admin/*` | AdminJwt + Permissions | change-request approval |
| `modules/loyalty-rules/manage.controller.ts` | `/v1/manage/*` | AdminJwt + Permissions(`brand.*`) | earn rules, rewards, tiers, campaigns, badges, challenges, members, customer profile/export/erase, settings, audit |
| `manage/{coupons,segments,templates,team,api-keys,webhooks,change-requests,reports,lulu}` | `/v1/manage/*` | AdminJwt + Permissions | brand-admin modules |
| `modules/loyalty-rules/customer.controller.ts` | `/v1/customer/*` | CustomerJwtGuard (brand-scoped token) | balance, transactions, expiring, rewards redeem, voucher redeem, badges, challenges, leaderboard, referral |
| `modules/customer-wallet/wallet.controller.ts` | `/v1/customer/wallet/*` | WalletJwtGuard (person-level token, NO RLS context; relies on `wallet_*` SECURITY DEFINER SQL functions) | cards, join brand, scan-code, mint brand token, profile, push-token, sessions, account deletion |
| `modules/partnerships/customer-partnerships.controller.ts` | `/v1/customer/partners` | CustomerJwt | Lulu link/convert (stub connector) |
| `modules/terminal-gateway/terminal.controller.ts` | `/v1/terminal/*` | TerminalHmacGuard, `@SkipThrottle` | config, app-version, members/{resolve,enroll,context,vouchers}, receipts, vouchers/redeem, quotes, transactions (+capture/void/get/batch) |
| `modules/terminal-gateway/receipt-public.controller.ts` | `/v1/r/:token`, `/v1/r/:token/pdf` | NONE | public e-receipt by token |
| `modules/wallet-pass/passkit-web.controller.ts` | `/v1/devices/...`, `/v1/passes/...`, `/v1/log` | NONE at guard level (Apple PassKit web service; auth header checked inside handler?), `@SkipThrottle` | device registration, pass fetch, Apple log sink |
| `modules/wallet-pass/wallet-pass.controller.ts` | `/v1/customer/wallet/passes`, `/v1/passes/apple` | WalletJwt / pass JWT in URL | Apple/Google pass issuance |
| `platform-core/email/brand-asset.controller.ts` | `/v1/assets/logo.png` | none | brand logo for emails |
| `modules/customer-wallet/app-status.controller.ts` | `/v1/customer/app-status` | none | min-version / maintenance flag |
| `platform-core/health/health.controller.ts` | `/health`, `/ready`, `/metrics` | none | |

## 3. Identity, roles, tokens

Token service: `apps/api/src/auth/tokens/token.service.ts`. HS256 JWTs via `@nestjs/jwt`. Access TTL 900s, refresh TTL 30d. Claims: `sub, surface, platformId, scopeLevel, groupId, brandId, branchId, roles[], actorType, elevated, onBehalfOf, wallet, sid`. The same `JWT_ACCESS_SECRET` also signs terminal member tokens (10 min, no `typ` claim) and Apple pass tokens (`typ: apple_pass`, 5 min). Refresh tokens: `RefreshToken` model (hash, rotation), see `auth.service.ts`.

Guards (`apps/api/src/auth/guards/`): `AdminJwtGuard` (surface superadmin|brand_admin -> `req.tenant`, `req.roles`), `CustomerJwtGuard` (surface customer, rejects `wallet` tokens), `WalletJwtGuard` (requires `wallet: true`, no tenant binding), `TerminalHmacGuard` (`Authorization: Loyalty-HMAC publishableKeyId=,ts=,nonce=,sig=`; canonical = method+path+ts+nonce+rawBody; secret envelope-decrypted from `api_key.secret_enc`; in-memory nonce set with a TODO to move to Redis).

RBAC: `apps/api/src/auth/authz/authz.service.ts` static map `ROLE_PERMISSIONS`. Roles from `packages/shared/src/enums.ts` `RoleKey`: platform_superadmin, platform_support, group_admin, brand_admin, brand_manager, branch_manager, analyst_readonly. `brand_manager` has NO entry in `ROLE_PERMISSIONS` (gets nothing). `analyst_readonly` gets `platform.report.read` (platform-wide reads) in addition to `brand.report.read`. `PermissionsGuard` reads roles from JWT claims only (no DB re-check, so revocation lags up to access TTL). Permission check is role-only; tenancy scoping relies on RLS GUCs set from JWT claims in `TenantService.run()` (`platform-core/tenancy/tenant.service.ts`).

Superadmin "act-as" (`superadmin.service.ts:116 actAsBrand`) mints a brand-scoped token with `elevated: true` + `onBehalfOf`; `ImpersonationSession` model exists. Governance locks (`GovernanceConfig`, `ChangeRequest`) gate brand edits; `elevated` bypasses them.

Actors:
- Customer (Person): phone OTP -> wallet token (person-level) -> per-brand customer token minted via `POST /customer/wallet/cards/:brandId/token`. Can view balances/history, redeem rewards and vouchers (app-side redemption), join brands, scan-code, referral, Lulu convert, profile, sessions, deletion.
- Brand user (UserAccount + RoleAssignment at brand scope; roles brand_admin / brand_manager / branch_manager / analyst_readonly): program config, members, exports, erase customers, team, API keys (terminal), webhooks, coupons, segments, templates, reports, change requests.
- Group admin: group wallet + brands under group.
- Superadmin / platform_support: everything platform-wide, incl. group wallet top-up, cost rules, issue vouchers to customers, impersonate brand, publish terminal APK releases, issue/revoke terminal HMAC keys, delete branches/terminals.
- Terminal (ApiKey + HMAC secret bound to brand/branch/terminal): resolve/enroll members, post receipts (earn), quote/authorize/capture/void redemptions, redeem vouchers, batch upload (offline outbox from `OfflineOutbox.kt`).
- System / workers: run under synthesized platform/group/brand `TenantContext` built by `WorkerRunner.perBrand/perGroup`.
- Apple PassKit web service: device-authenticated by pass auth token (verify in `passkit-web.controller.ts`).
- Partner (Lulu): outbound only; stub.

## 4. Data model highlights (packages/db/prisma/schema.prisma)

Tenancy: Platform -> Group -> Brand -> Branch. ~60 models. Ledger: `LedgerAccount`, `Journal`, `Entry`, `AccountBalance` (posted_credits/posted_debits/pending_debits), `GroupWallet`, `CostRule`. Loyalty: `LoyaltyEarnRule`, `RedemptionConfig`, `Tier`, `RewardCatalogItem`, `Voucher`, `Receipt`, `TerminalTransaction` (state machine pending->authorized->captured|voided|expired|reversed|failed), `Coupon(+Redemption)`, `Campaign`, `Badge/Award`, `Challenge/Progress`, `Referral`. Identity: `Person` (phoneHash + phoneEnc envelope-encrypted, emailHash), `CustomerMembership`, `CustomerIdentifier`, `UserAccount` (argon2id, TOTP), `RefreshToken`, `ImpersonationSession`, `ApiKey` (secretEnc, prevSecretHash unused), `OtpCode`. Infra: `Outbox`, `IdempotencyKey`, `AuditLog` (hash-chained), `WebhookEndpoint/Delivery`, `GovernanceConfig`, `ChangeRequest`, `BrandDailyMetric`, `RfmSnapshot`, `TerminalRelease`. Partnerships: `Partner`, `PartnerMerchant`, `AllowanceWallet/Txn`, `PartnerCustomerLink`, `Conversion`, `AllowanceTopupRequest`.

DB-level invariants (`packages/db/prisma/sql/ledger.sql`): `no_mutation` triggers on journal/entry (append-only), `journal_balanced` constraint trigger, `entry_amount_positive CHECK`, `account_balance_non_negative CHECK`, unique account identity index. RLS (`rls.sql`): `loyalty_app` non-owner role, ENABLE (not FORCE) RLS on ~45 tables, policies on `app.current_{platform,group,brand,branch,actor}_id` GUCs set via `set_config(..., true)` per transaction in `TenantService`. Person-level wallet reads go through `wallet_*` SECURITY DEFINER functions (`2026-07-28_customer_wallet.sql`, `2026-08-03_wallet_sessions.sql`, etc.). Local dev `.env` uses the owner role (RLS bypassed); prod uses `APP_DATABASE_URL`.

## 5. Money / points flows

Ledger engine: `packages/db/src/ledger/engine.ts` (`getOrCreateAccount`, `holdPending`, `releasePending`, `captureHold`, `creditAccount`, `postJournal`, `reserveIdempotency`, `completeIdempotency`). Operations: `packages/db/src/ledger/operations.ts`: `earnPoints`, `adjustPoints`, `authorizeRedeem`, `captureRedeem`, `voidRedeem`, `loadPoints` (membership card, cash->points, uncommitted WIP), `spendPoints` (uncommitted WIP), `topUpWallet`, `drawdownWallet`. Journal kinds: earn, redeem_auth, redeem_capture, void, reverse, topup, drawdown, expiry, adjust, fee, load, spend.

| Flow | Entry point | Service | Ledger op |
|---|---|---|---|
| Earn (POS receipt) | `POST /v1/terminal/receipts` (HMAC) | `terminal.service.ts:269 createReceipt` -> `loyalty.service.ts:232 earnWithTx` (rules engine in `packages/shared`) | `earnPoints` |
| Earn (offline batch) | `POST /v1/terminal/transactions/batch` | `terminal.service.ts:829 batch` | same |
| Earn bonuses: referral, badges, challenges, campaigns, stamp cards, receipt celebrations | `customer.controller.ts` referral/redeem; gamification + campaigns modules | `gamification/*`, `campaigns/*` | `earnPoints` |
| Burn (POS redemption) | `POST /v1/terminal/quotes` -> `transactions` -> `transactions/:id/capture` or `void` | `terminal.service.ts:596/641/745/796` | `authorizeRedeem` (hold) -> `captureRedeem` / `voidRedeem` |
| Burn (in-app reward -> voucher) | `POST /v1/customer/rewards/:id/redeem` | `loyalty.service.ts:897 redeem` | `captureRedeem` + `Voucher` row |
| Voucher redeem at till | `POST /v1/terminal/vouchers/redeem`, `/members/vouchers` | `terminal.service.ts:496` | voucher status transition |
| Superadmin voucher issue/cancel | `POST /v1/admin/vouchers`, `/:id/cancel` | `superadmin.service.ts:796/839` | voucher only (verify whether points are debited) |
| Manual adjust | callers of `adjustPoints` (superadmin / manage customer profile) | | `adjustPoints` (+AuditLog) |
| Reversal / refund | `RefundScreen.kt` on terminal -> verify server path; `JournalKind.reverse` | | `reverse` |
| Expiry | hourly `ExpirySweepService.sweepBrand` | bucket math without lot table, breakage journal | `postJournal(kind: expiry)` |
| Group wallet top-up (prepaid funding) | `POST /v1/admin/groups/:id/wallet/topup` (`group.wallet.manage`) | `superadmin.service.ts` | `topUpWallet` |
| Settlement (brand owes platform per redeemed point) | 60s `SettlementService.settleGroup` | cost rule x points | `drawdownWallet` |
| Partner conversion (points -> Lulu) | `POST /v1/customer/partners/...` | `partnerships/conversion.service.ts` + `AllowanceWallet` | debit points + allowance txn; connector stub |
| Membership card load/spend (uncommitted WIP) | terminal intents `load`/`spend` | `operations.ts:428/523` | `loadPoints`/`spendPoints` |
| Account deletion (crypto-shred) | `POST /v1/customer/wallet/deletion` + hourly sweep | `customer-wallet/deletion.service.ts` | none |

## 6. Front-ends

- web-brand (`platform.partnerspoints.ae`): Next 15 App Router, client-side fetch to `NEXT_PUBLIC_API_URL`; access token in `localStorage['rfm_token']` (`apps/web-brand/lib/api.ts`). No `middleware.ts`, no custom security headers in `next.config.mjs`, `eslint.ignoreDuringBuilds`. `/act` route = superadmin act-as landing.
- web-superadmin: same pattern, `localStorage['rfm_sa_token']`. No headers config.
- docs portal: cookie session (`lib/auth.ts`), middleware gate, X-Frame-Options/nosniff/noindex headers set.
- mobile (Expo 54, bundle `ae.partnerspoints.app`): tokens in AsyncStorage (`apps/mobile/lib/api.ts`: `pp_wallet_token`, `pp_refresh_token`), no expo-secure-store dependency, no cert pinning, `scheme: partnerspoints` deep links, join links `https://partnerspoints.ae/join/<code>`, EAS Updates OTA enabled, `expo-local-authentication` app lock (flag in AsyncStorage). `apps/mobile/dist/` present on disk (check tracking).
- terminal-android: Kotlin/Compose, HMAC via `TerminalApi.kt`, `SettingsStore.kt` holds pairing secret, `OfflineOutbox.kt` queues txns, `AppUpdater.kt` self-updates from `terminal-releases` (verify signature checks), release keystore + passwords committed.

## 7. Observability / ops

`/health`, `/ready`, `/metrics` endpoints (`platform-core/health`). Pino structured logs with request id + tenant props. No tracing, no external APM, no alerting config in repo. Backups: Supabase managed (no documented restore drill). Docs: `docs/security.md` (self-assessed posture + pre-prod checklist, all items unchecked), `docs/deployment.md`, `DEPLOYMENT.md`.

## 8. Test inventory

`apps/api/test/*.e2e.test.ts` (17 files: terminal, wallet, otp, governance, manage-crud, reporting, analytics, expiring-points, txn-alerts, account-deletion, pii-backfill, pass-data, schema-migrator, promotions, engagement, segments-demographics, csv, wallet-pass), `packages/db/test/{ledger,loyalty,rls}.test.ts`, `packages/shared/test/rules.test.ts`, `apps/terminal-android/.../CoreLogicTest.kt`. No tests for web consoles or mobile. Smoke: `apps/api/scripts/smoke.mjs`.

## 9. Known-by-authors gaps (from code comments / docs)

- Nonce store + throttler in-memory (not shared across instances).
- HMAC key rotation overlap never built (`prev_secret_hash` unusable).
- PII master key is an env var, not KMS.
- BullMQ/Redis path dead; `jobs` worker in DO spec runs the API image and does nothing useful.
- `docs/security.md` pre-production checklist: all boxes unchecked.

## 10. How to verify locally (read-only / local only)

```
pnpm install
pnpm db:dev            # embedded Postgres on localhost (see packages/db/scripts/dev-db.ts for port)
pnpm --filter @rfm-loyalty/db db:apply && pnpm db:seed   # seed prints demo admin password
pnpm --filter @rfm-loyalty/api dev                        # http://localhost:3001, Swagger at /docs
pnpm --filter @rfm-loyalty/api test                        # e2e suite spins its own embedded pg
```
Never point at `api.partnerspoints.ae` or the Supabase project. Do not run `db:migrate` / `apply-sql` against anything but the local embedded DB. Do not commit, do not edit source files; write findings only under `AUDIT/`.
