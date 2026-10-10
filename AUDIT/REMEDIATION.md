# Remediation — what was fixed (branch `remediation/pre-prod-hardening`)

Companion to `REPORT.md` (findings) and `14_redteam_verification.md` (verification). This records the code changes made in response, all committed to the branch `remediation/pre-prod-hardening` and **not pushed** (the `main` branch auto-deploys on push). A polished summary is on the Desktop: `Partners Points - Production Readiness Report.pdf`.

## Verified locally
- Workspace typecheck: pass (10 packages).
- `@rfm-loyalty/db` tests: 25 pass. `@rfm-loyalty/shared`: 11 pass. `@rfm-loyalty/api`: 175 pass (incl. new `fraud.e2e` ×4, `referral.e2e` ×4; updated `terminal.e2e`, `txn-alerts.e2e`).
- Nothing run against production, Supabase, DigitalOcean or Vercel.

## Code-fixed Critical/High (maps to AUDIT finding IDs)
| Finding | Fix | Files |
|---|---|---|
| C2 / LEDGER-01 referral ping-pong | one-time referee, reciprocal block, new-member window, per-referrer 30-day cap | `referral.service.ts`, `referral.e2e.test.ts` |
| C3 / LEDGER-02 voucher replay | voucher dedupe on capture journal + unique index | `loyalty.service.ts`, `2026-10-10_ledger_hardening.sql` |
| C4 / LEDGER-03 / DB-02 capture∥void race | guarded `releasePending`, atomic state claim, `pending_debits >= 0` CHECK | `ledger/engine.ts`, `terminal.service.ts`, `2026-10-10_ledger_hardening.sql` |
| H9 / LEDGER-07 uncapped redemption | server-enforced minimum + points capped to bill share | `terminal.service.ts`, `terminal.e2e.test.ts` |
| H7 / DB-01 / AUTHZ-05 workers no-op under RLS | `SECURITY DEFINER` tenant enumerators | `2026-10-10_worker_enumeration.sql`, `worker-runner.service.ts` |
| H16 / H26 owner creds + unsafe boot | prod env validation requires secure role, CORS, 32-byte PII key, non-dev secrets | `config/env.ts` |
| H17 / SC-03 PII key fallback | no hard-coded fallback in production; fail-closed | `envelope-crypto.service.ts` |
| H1 / APPSEC-01 / API-01 throttler on LB IP | `trust proxy` set | `main.ts` |
| H6 / AUTHZ-03 MFA enrol disables factor | enrol re-authenticates; mandatory-MFA switch; password-change endpoint | `auth.service.ts`, `admin-auth.controller.ts`, `admin-auth.dto.ts` |
| H25 no graceful shutdown | `enableShutdownHooks` | `main.ts` |
| H26 reflect-any CORS | no reflect-any in production | `main.ts` |
| H31 / PRIV-09 no retention | daily `run_retention()` purge | `2026-10-10_retention.sql`, `worker-runner.service.ts` |
| H34 / CQ-05 errors become 500 | map LedgerError / ZodError / Prisma P2002/P2025 | `all-exceptions.filter.ts` |
| H35 missing indexes | ledger_account.customer_id, settlement, entry expiry, refresh_token | `2026-10-10_ledger_hardening.sql` |
| C7 / FE-02 seeded admins | seed refuses `NODE_ENV=production`; demo creds removed from DTO examples | `seed.ts`, `admin-auth.dto.ts` |
| FE-03 / APPSEC-06 console headers | X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS | `web-brand`/`web-superadmin` `next.config.mjs` |
| H33 / CQ-03 untracked migration | membership load/spend SQL committed with its list entry | `2026-08-06_membership_load_spend.sql` |

## New: fraud-protection module
Tables `fraud_rule` / `fraud_alert` (RLS), detectors (member velocity, member points/day, cashier self-earn, referral burst), deduped alerts, email trigger, brand console (`/v1/manage/fraud`) and superadmin console (`/v1/admin/fraud`), 10-minute background scan. Files under `apps/api/src/modules/fraud/*`, migration `2026-10-10_fraud_module.sql`, tests `fraud.e2e.test.ts`.

## NOT done here — owner / client actions (see REPORT.md §4 and the PDF §6)
Repository privacy; Android signing-key rotation + history purge; production DB-role confirmation; managed KMS for the PII key; Supabase password; removal of group-admin self-funding permission; deployment gating. Client apps (customer token storage + server logout, terminal default PIN + demo mode, console MFA UI) and the console dependency upgrade are separate changes that need a device/console build to verify and were not made here.
