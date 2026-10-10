# 07 — Infrastructure & Cloud Security Audit

Audit date: 2026-10-10. Branch `main` @ afc3fe2. Read-only review of the repository as committed plus the local working tree. No commands were run against DigitalOcean, Vercel, Supabase, Twilio or any production host; everything marked **Needs verification** requires dashboard or live access that this audit did not have.

Scope: root `Dockerfile`, `.do/app.yaml`, `apps/*/vercel.json` + `next.config.mjs`, `.github/workflows/ci.yml`, `apps/api/src/config/env.ts`, `apps/api/src/main.ts`, `apps/api/src/platform-core/prisma/schema-migrator.ts`, Prisma connection services, worker runner/scheduler, secret-loading code (PII envelope, Apple PassKit/APNs, Google Wallet, Twilio, Resend), RLS coverage vs. Supabase exposure, `DEPLOYMENT.md`, `docs/deployment.md`, `docs/security.md`, on-disk secrets in the workspace.

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 4 | INFRA-01, INFRA-02, INFRA-03, INFRA-04 |
| Medium | 13 | INFRA-05 … INFRA-17 |
| Low | 7 | INFRA-18 … INFRA-24 |
| Info | 2 | INFRA-25, INFRA-26 |

Headline: the API container is the DB owner at runtime (INFRA-01); the PII master key silently degrades to a public dev key if misconfigured (INFRA-02); Express never trusts the DigitalOcean proxy, so the rate limiter keys every client on the load-balancer address and five OTP requests a minute lock the whole platform out of sign-in (INFRA-03); and there is textual evidence that seed data (which includes a platform superadmin with the password `ChangeMe123!` and no MFA) reached a real database (INFRA-04).

Architecture facts established for the other agents:

- DO App Platform, region `fra`, `api` service 2 × `basic-xs` (Docker from root `Dockerfile`) + `jobs` worker 1 × `basic-xs` running the same image with `ROLE=worker` (`.do/app.yaml:7-77`). No `alerts:`, `domains:`, `ingress:` blocks.
- Vercel: three Next.js projects with minimal `vercel.json` (framework + install/build command only). The two consoles set no custom headers; the docs portal does.
- Supabase Postgres reached over the public Supavisor pooler (`.env.example:7-11`), owner role `postgres.<ref>` for `DATABASE_URL`/`DIRECT_URL`, `loyalty_app` for `APP_DATABASE_URL`.
- Migrations: hand-written SQL applied at API boot under a `pg_advisory_lock(4820117)` (`schema-migrator.ts:39,151`), using `DIRECT_URL ?? DATABASE_URL` (owner).
- Background jobs: `setInterval` loops in `WorkerRunner` on **every** instance including the `jobs` worker (no `ROLE` check, `worker-runner.service.ts:44-71`).

---

## Findings

### INFRA-01 — API and worker containers hold the Postgres owner credential at runtime

- **Severity:** High  **CVSS 3.1:** AV:N/AC:H/PR:L/UI:N/S:C/C:H/I:H/A:H — 8.8 (chained: any code-execution, SSRF-to-metadata or env-disclosure bug in the API becomes full-database compromise with RLS bypassed)
- **Confidence:** Confirmed (code and spec); whether `APP_DATABASE_URL` is actually the `loyalty_app` role in production is **Needs verification**
- **Location:** `.do/app.yaml:26-28,72-73`; `apps/api/src/auth/auth-prisma.service.ts:19`; `apps/api/src/platform-core/prisma/schema-migrator.ts:132`; `DEPLOYMENT.md:55`
- **Evidence:**
  - `.do/app.yaml:26-28` gives the `api` service `DATABASE_URL`, `DIRECT_URL` **and** `APP_DATABASE_URL`; `:72-73` gives the `jobs` worker `DATABASE_URL` + `APP_DATABASE_URL`. Per `.env.example:7-9` both `DATABASE_URL` and `DIRECT_URL` are the `postgres.<ref>` owner.
  - `auth-prisma.service.ts:19`: `const url = config.get('DIRECT_URL') ?? config.get('DATABASE_URL')` — the owner client is live in the request path (login, OTP, token refresh, terminal HMAC guard: `terminal-hmac.guard.ts` and `otp-store.service.ts` import it).
  - `schema-migrator.ts:132`: boot migration runs as owner from inside the serving container; this is the architectural reason the owner secret must be present at runtime.
  - `DEPLOYMENT.md:55`: "`APP_DATABASE_URL` → the `loyalty_app` role (**or reuse `DATABASE_URL` to start**)". If that shortcut was taken, `PrismaService` (`prisma.service.ts:16`) connects as owner and every RLS policy (`rls.sql`, all `TO loyalty_app`) is bypassed for the entire application.
  - `rls.sql` never issues `FORCE ROW LEVEL SECURITY` (grep count 0), so the owner is exempt from every policy.
- **Impact:** A single RCE/SSRF/prototype-pollution bug, or anyone with DO "app read" access to env vars, obtains a credential that bypasses tenant isolation across all merchants' ledgers and PII.
- **Exploit scenario:** Attacker finds an SSRF or dependency RCE in the API → reads `process.env.DIRECT_URL` → connects to `aws-0-<region>.pooler.supabase.com:5432` from anywhere (public pooler) → `SELECT phone_enc, totp_secret_enc ...` from every tenant; or `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`.
- **Fix:**
  1. Move migrations to a DO **pre-deploy job** (`jobs: - kind: PRE_DEPLOY` in the app spec) that is the only component given `DIRECT_URL`; remove `DATABASE_URL`/`DIRECT_URL` from `api` and `jobs`.
  2. Give the auth path a second limited role (`loyalty_auth`, `NOBYPASSRLS`, GRANTs only on `user_account`, `refresh_token`, `otp_code`, `api_key`, `person`) instead of the owner; or route the pre-context lookups through `SECURITY DEFINER` functions as the OTP path already does (`otp_code.sql:92-98`).
  3. Add `FORCE ROW LEVEL SECURITY` on tenant tables so even the owner is subject to policies (agent 09 to confirm migration tooling still works).
  4. Verify in the DO dashboard that `APP_DATABASE_URL` is the `loyalty_app` login and that `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname='loyalty_app'` is `f,f`.
- **Effort:** M

### INFRA-02 — PII master key silently falls back to a hard-coded, public dev key; not validated at boot

- **Severity:** High  **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N — 7.4
- **Confidence:** Confirmed (code path); whether production currently carries a valid 32-byte key is **Needs verification**
- **Location:** `apps/api/src/auth/crypto/envelope-crypto.service.ts:15-23`; `apps/api/src/config/env.ts:4-26`
- **Evidence:**
  ```ts
  // envelope-crypto.service.ts:16-21
  const b64 = config.get<string>('PII_MASTER_KEY_BASE64');
  let key = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
  if (key.length !== 32) {
    this.logger.warn('PII_MASTER_KEY_BASE64 missing/invalid; deriving a DEV key. Do not use in prod.');
    key = createHash('sha256').update('rfm-loyalty-dev-key').digest();
  }
  ```
  `env.ts` validates 14 variables and `PII_MASTER_KEY_BASE64` is not one of them, so a missing, truncated or mistyped value (e.g. a 44-char base64 string with a trailing newline decodes to 33 bytes) does not stop the boot. The same key wraps phone numbers, TOTP secrets, terminal HMAC secrets (`api_key.secret_enc`) and webhook secrets (`webhook.service.ts:199`).
- **Impact:** Every "encrypted" PII and secret column becomes decryptable by anyone who has read this repository. A DB dump (or INFRA-14 exposure) then yields plaintext phones, MFA seeds and every terminal's signing secret.
- **Exploit scenario:** Operator rotates the DO secret and pastes a value with a stray character → API restarts with a warning nobody reads → from that moment all new rows are encrypted under `sha256('rfm-loyalty-dev-key')`, and old rows fail to decrypt (`readMaybeEncrypted` logs an error and returns null — customers silently stop receiving alerts, terminals stop authenticating as their secrets fail to decrypt).
- **Fix:** Add `PII_MASTER_KEY_BASE64: z.string().refine(v => Buffer.from(v,'base64').length === 32)` to `envSchema` and make it required when `NODE_ENV === 'production'`; delete the dev-key fallback in production (throw). Longer term: key in a KMS (DO does not offer one; use Supabase Vault or an external KMS) with a `key_version` column so rotation is possible — today there is no re-encryption path for a key change (`pii-backfill.service.ts` only handles plaintext→ciphertext).
- **Effort:** S (validation) / L (KMS + versioned rotation)

### INFRA-03 — No `trust proxy`: rate limiter, session and audit IPs all see the DigitalOcean load balancer; 5 OTP requests/minute lock every customer out

- **Severity:** High  **CVSS 3.1:** AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H — 7.5
- **Confidence:** Confirmed (code); the exact source-address behaviour of the DO ingress is **Likely** (App Platform terminates TLS and forwards via `X-Forwarded-For`)
- **Location:** `apps/api/src/main.ts:38-74` (no `app.set('trust proxy', …)`; grep for `trust proxy` across `apps/api/src` returns nothing); `node_modules/.pnpm/@nestjs+throttler@6.5.0_*/dist/throttler.guard.js:141-143` (`getTracker(req) { return req.ip; }`); `apps/api/src/app.module.ts:41-43,93`; `apps/api/src/auth/controllers/customer-auth.controller.ts:22,34`; `apps/api/src/auth/device.ts:23`
- **Evidence:** Express only populates `req.ip` from `X-Forwarded-For` when `trust proxy` is set; otherwise it is the TCP peer, i.e. the DO ingress. `ThrottlerGuard` keys on `req.ip`, storage is the default in-memory store (`ThrottlerModule.forRoot([...])` with no `storage`). Therefore:
  - `POST /v1/customer/auth/otp` (`@Throttle 5/min`) is 5 requests per minute **per instance for the whole internet**, not per client.
  - `POST /v1/customer/auth/verify` is 10/min platform-wide; `POST /v1/auth/login` and `/mfa` are 10/min platform-wide.
  - Everything else is 300/min platform-wide per instance (600/min across 2 instances) — including brand-console dashboards during business hours.
  - `deviceOf(req)` (`device.ts:23`) stores the LB address as the session IP shown to customers in "your devices", and `auth.service.ts:353` persists it; audit logs inherit the same value.
- **Impact:** Trivial, unauthenticated denial of service of customer sign-in and admin login (a single `curl` loop of 10 requests/minute from one host); legitimate dashboard traffic will trip 429s under normal load; forensic IP data is useless. Conversely, once `trust proxy` is fixed the SMS cost sink becomes per-IP and needs a global budget (see INFRA-15).
- **Exploit scenario:** `while true; do curl -s -X POST https://api.partnerspoints.ae/v1/customer/auth/otp -d '{"phone":"+971500000000"}' -H 'content-type: application/json'; sleep 10; done` from two hosts keeps both instances' OTP bucket full; every real customer gets 429 "Too Many Requests" indefinitely. Cost to attacker: nothing; the per-phone limit in `otp_issue` (`otp-store.service.ts:13-14`: 5 per 15 min) does not help because the IP bucket trips first.
- **Fix:** In `main.ts` after `NestFactory.create`: `app.getHttpAdapter().getInstance().set('trust proxy', 1)` (DO places exactly one proxy hop; do not use `true`). Move the throttler to a Redis/Valkey store (`@nestjs/throttler` + `nestjs-throttler-storage-redis`) so the 2 instances share buckets — `REDIS_URL` is already provisioned. Add a platform-wide SMS budget (e.g. 500/hour) as a second guard in `OtpStoreService.issue`.
- **Effort:** S

### INFRA-04 — Seeded platform superadmin (`superadmin@rfm-loyalty.dev` / `ChangeMe123!`, no MFA) may exist in the production database

- **Severity:** High (Critical if confirmed)  **CVSS 3.1 if present:** AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H — 10.0
- **Confidence:** Needs verification (strong textual indicator)
- **Location:** `packages/db/prisma/seed.ts:16,41,124-125,273`; `apps/api/src/auth/crypto/envelope-crypto.service.ts:49-52`; `.github/workflows/ci.yml:90`; `package.json:21`
- **Evidence:**
  - `seed.ts:16` `const DEMO_PASSWORD = 'ChangeMe123!'`; `:124-125` creates `superadmin@rfm-loyalty.dev` with `platform_superadmin` at platform scope; `makeUser` (`:85-100`) enrols no TOTP. The seed "Connects via DIRECT_URL as the owner role" (`:4`) and is "Idempotent — safe to re-run" (`:4`), i.e. nothing stops it from being pointed at Supabase: `DIRECT_URL=<prod> pnpm db:seed`.
  - `envelope-crypto.service.ts:49-52` (committed code comment): "Some rows hold the value in the clear — **seeded data, and at least one real customer**. Callers were doing … so those rows read as 'no phone' and every message to them was silently dropped." Messages are only sent in an environment with Twilio configured, i.e. production. The PII backfill worker (`pii-backfill.service.ts`) was written to repair that environment. This is direct evidence that seed rows and real customers co-existed in one database.
  - `secrets/CamelBean.pkpass` on the developer workstation is a pass for the seed brand "Camel Bean Coffee" (`seed.ts:132`) — consistent with seed data being used for live Apple Wallet testing.
  - `DEPLOYMENT.md:33` says production "starts clean", but no control enforces it; `ci.yml:90` prints the password into CI logs on every run (`seed.ts:273`).
- **Impact:** Full platform takeover: issue vouchers, top up group wallets, impersonate any brand (`actAsBrand`), publish terminal APK releases to the fleet, export every customer.
- **Exploit scenario:** `POST /v1/auth/login {"email":"superadmin@rfm-loyalty.dev","password":"ChangeMe123!"}` — the throttle (10/min, INFRA-03) is irrelevant for one guess. The three seeded brand/group admins (same password) give the same for their tenants.
- **Fix:** Run against production (read-only): `SELECT email, created_at, totp_secret_enc IS NOT NULL AS mfa FROM user_account WHERE email_lower LIKE '%rfm-loyalty.dev' OR email_lower LIKE '%@example%';` and `SELECT name FROM brand WHERE slug IN ('camel-bean','date-co','souk-mart');`. If any row exists, disable the accounts and rotate every secret the superadmin could have read. Permanently: make `seed.ts` refuse to run when the host matches `supabase.com` or when `NODE_ENV=production`, generate a random password printed once, and require TOTP enrolment on first superadmin login.
- **Effort:** S (check + guard) / M (forced MFA)

### INFRA-05 — Long-lived signing material and platform tokens are raw environment strings and plaintext workstation files; no KMS, no rotation path

- **Severity:** Medium  **CVSS 3.1:** AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N — 7.1 (requires workstation or DO console access)
- **Confidence:** Confirmed
- **Location:** `secrets/` (workspace root), `.do-token` (71 bytes, `dop_v1_…` format), `.env`; `apps/api/src/modules/wallet-pass/apple-wallet.service.ts:259-264`; `apns.service.ts:43-47`; `google-wallet.service.ts:43-45`; `.do/app.yaml:26-51`
- **Evidence:**
  - `secrets/` contains `pass.p12`, `p12-base64.txt`, `p12-password.txt` (28 bytes — the password in the clear), `pass.key` (unencrypted RSA key), `AuthKey_23V7M4332V.p8` (APNs key, the key ID is in the filename), `apns-key-base64.txt`. All world-readable `-rw-r--r--`. Gitignored (`.gitignore:62`) but adjacent to `.do-token` (a DigitalOcean API token of unknown scope; a read/write token can redeploy the API with attacker-controlled env vars and read all current secrets).
  - The API reads the p12 as base64 **plus** its password from two env vars (`apple-wallet.service.ts:259,263`), the APNs private key from env (`apns.service.ts:44`), the Google service-account private key from env (`google-wallet.service.ts:44`). None of these appear in `.do/app.yaml`, so they were (or will be) added by hand in the dashboard with no record of who set them.
  - `secrets/CamelBean.pkpass` is a signed pass — anyone who copies the folder can mint passes for the `APPLE_PASS_TYPE_ID` until Apple revokes the certificate.
  - `JWT_ACCESS_SECRET` also derives the Apple pass auth token (`apple-wallet.service.ts:213`) and signs terminal member tokens; rotating it invalidates every wallet pass registration.
- **Impact:** Theft of the workstation folder = ability to sign Apple passes, send APNs pushes as the app, mint Google Wallet objects and (via `.do-token`) redeploy production. Rotation of the PII key or the JWT secret is not operationally possible today without a bespoke migration.
- **Fix:** Store `.do-token` in the OS credential store (`doctl auth init` already does this) and delete the file; encrypt `secrets/` at rest (age/sops) and remove `p12-password.txt`; confirm the DO token scope is read-only or custom-scoped. Introduce a `key_version` prefix on envelope ciphertexts and a rotation job. Separate the pass-auth HMAC key from `JWT_ACCESS_SECRET`.
- **Effort:** M

### INFRA-06 — Database TLS is opportunistic and, for the migrator, unverified

- **Severity:** Medium  **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N — 7.4 (rated down: requires on-path position between DO `fra` and the Supabase pooler)
- **Confidence:** Likely; Supabase "Enforce SSL on incoming connections" state is **Needs verification**
- **Location:** `apps/api/src/platform-core/prisma/schema-migrator.ts:94-119`; `.env.example:7-11`; `DEPLOYMENT.md:28,53-54`; `packages/db/scripts/apply-sql.ts:20`
- **Evidence:**
  - `schema-migrator.ts:111-116`: `sslmode=require` and `prefer` are mapped to `{ rejectUnauthorized: false }` — encrypted but **any** certificate is accepted. The comment explains this was done after `SELF_SIGNED_CERT_IN_CHAIN` broke a deploy, i.e. the Supabase CA was never installed.
  - Every documented connection string (`.env.example:7-11`, `DEPLOYMENT.md:28,53-54`) carries no `sslmode` at all. Prisma's default for PostgreSQL is `prefer`: TLS is attempted and silently downgraded to plaintext if the server declines, and the chain is not verified.
  - `apply-sql.ts:20`: `new Client({ connectionString: url })` with no `ssl` option — the one-time production schema apply from a laptop (`DEPLOYMENT.md:26-30`) runs in whatever mode the pooler negotiates.
  - Supabase does not enforce SSL by default; the pooler is on the public internet (no VPC peering on standard plans).
- **Impact:** Owner credentials (INFRA-01) and all tenant data cross the public internet with no server authentication; an on-path attacker or a DNS compromise of `*.pooler.supabase.com` can present any certificate.
- **Fix:** Enable "Enforce SSL" in Supabase; ship the Supabase CA (`prod-ca-2021.crt`) in the image and use `sslmode=verify-full&sslrootcert=/app/certs/supabase-ca.crt` on all three URLs; drop the `rejectUnauthorized:false` branch; set `ssl: { ca }` in `apply-sql.ts`.
- **Effort:** S

### INFRA-07 — CORS reflects any origin with credentials in production (`CORS_ORIGINS` absent from the app spec)

- **Severity:** Medium  **CVSS 3.1:** AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N — 5.4
- **Confidence:** Confirmed (spec); live header value **Needs verification**
- **Location:** `apps/api/src/main.ts:42-48`; `.do/app.yaml:23-54` (no `CORS_ORIGINS`); `apps/api/src/config/env.ts` (not validated)
- **Evidence:** `app.enableCors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true })` — with the env var unset this emits `Access-Control-Allow-Origin: <request origin>` + `Access-Control-Allow-Credentials: true` for every origin. The consoles keep tokens in `localStorage` and send them as bearer headers, which limits classic CSRF, but any website can now drive the OTP, login, public receipt and `app-status` endpoints from a victim's browser and read responses, and any future cookie-based session would be fully exposed.
- **Fix:** Add `CORS_ORIGINS` to `.do/app.yaml` (`https://platform.partnerspoints.ae,https://superadmin.platform.partnerspoints.ae,https://docs…`), validate it as required in production in `env.ts`, and make the fallback `false` (deny) rather than `true` when `NODE_ENV=production`. Mobile and terminal clients are not browsers and do not need CORS.
- **Effort:** S

### INFRA-08 — No `.dockerignore`: `COPY . .` places secrets and the Android signing keystore in build-stage layers

- **Severity:** Medium  **CVSS 3.1:** AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N — 5.5
- **Confidence:** Confirmed
- **Location:** `Dockerfile:12` (`COPY . .`), `Dockerfile:34,38` (runner copies only `/out` and `prisma/sql`); `.dockerignore` does not exist (`cat: .dockerignore: No such file or directory`); `git ls-files` shows `apps/terminal-android/keystore.properties` and `apps/terminal-android/keystore/rfmhub.keystore` tracked
- **Evidence:**
  - **Local build** (`docs/deployment.md:21` tells operators to `docker build … && docker run --env-file .env`): the build stage ingests `.env`, `.do-token`, `secrets/` (p12 + password + APNs key), `.git/`, `node_modules/` (Windows binaries) and `.vercel/`. The final `runner` stage does not contain them, but the `build` stage layer is cached locally and is exported by `docker save`, BuildKit cache exports, or any `--target build` push.
  - **DO build** (from the GitHub clone): the layer contains the committed release keystore and its plaintext store/key passwords (`keystore.properties`: `storePassword=…`, `keyPassword=…`). DO's build cache is DO-internal, so exposure is to DO and to anyone who can trigger/download a build; not to the public.
  - `pnpm install --frozen-lockfile` on top of a copied host `node_modules` also makes the build slower and non-hermetic.
- **Impact:** Anyone with access to a developer's Docker daemon or build cache obtains the Apple signing identity, DO API token and the Android release signing key.
- **Fix:** Add `.dockerignore` with at least: `.git`, `node_modules`, `**/node_modules`, `.env*`, `!.env.example`, `.do-token`, `secrets/`, `apps/terminal-android`, `apps/mobile`, `apps/web-*`, `apps/docs`, `AUDIT`, `docs`, `*.keystore`, `*.p12`, `*.p8`, `.vercel`, `.turbo`, `**/dist`, `**/.next`. Untrack the keystore and rotate it (agent 05 owns the keystore finding; the Docker layer exposure is the infra angle).
- **Effort:** S

### INFRA-09 — Container runs as root on an unpinned base image with a writable filesystem and no runtime limits

- **Severity:** Medium  **CVSS 3.1:** n/a (hardening gap; multiplies the impact of any RCE)
- **Confidence:** Confirmed
- **Location:** `Dockerfile:5,7,13,31-42`; `.do/app.yaml:17,64`
- **Evidence:**
  - `FROM node:22-slim` (`:5`) — floating tag, no `@sha256:` digest: two builds of the same commit can differ, CVE drift goes unnoticed, and `apt-get install openssl ca-certificates` (`:6`) pulls whatever Debian has that day.
  - No `USER` instruction anywhere; `CMD ["node","dist/main.js"]` (`:42`) runs as uid 0. `node:22-slim` ships a `node` user (uid 1000) that is unused.
  - `RUN corepack enable` (`:7`) then `pnpm install` — corepack downloads pnpm 10.29.3 from the npm registry at build time; `package.json:6` `"packageManager": "pnpm@10.29.3"` carries no `+sha512.…` integrity hash.
  - No read-only root FS, no capability drops, no `--max-old-space-size`, no `NODE_OPTIONS`. `basic-xs` is 1 shared vCPU / 1 GB (per DO's published sizes; **Needs verification** in the dashboard). `sharp` (`stamp-strip.ts:78-81`, native libvips, allocates outside the V8 heap) and `pdfkit` (`receipt-public.controller.ts:55`, in-heap) both run on the request path. An OOM kill restarts the container and DO routes to the other instance; with two such requests in flight both instances can die together.
  - The Dockerfile `HEALTHCHECK` (`:41`) is ignored by App Platform (it uses `health_check.http_path`), so it only matters for local `docker run`.
- **Impact:** Any code execution in the API runs as root inside the container with a writable FS — easier persistence and, on a kernel escape, host compromise. Non-reproducible images defeat SBOM/CVE tracking.
- **Fix:** Pin `FROM node:22-slim@sha256:<digest>` (renovate it); `USER node` before `CMD`; `chown -R node:node /app`; add `+sha512` to `packageManager`; set `ENV NODE_OPTIONS=--max-old-space-size=640` (≈ 60 % of 1 GB) and `--unhandled-rejections=strict`; move image rendering to a bounded concurrency queue or precompute strips at brand-config time.
- **Effort:** S

### INFRA-10 — `deploy_on_push: main` with no CI gate, no approval and no rollback plan

- **Severity:** Medium  **CVSS 3.1:** n/a (process control)
- **Confidence:** Confirmed (repo); GitHub branch-protection state **Needs verification**
- **Location:** `.do/app.yaml:12-15,60-63`; `.github/workflows/ci.yml` (no `deploy` job, no `permissions:`); `docs/deployment.md:30` ("Wire a deploy step (DO + Vercel) on `main` after CI passes" — never done)
- **Evidence:** DO builds from `Followingae/PartnersPointsEngine@main` on every push independently of GitHub Actions. Vercel does the same for the three Next.js apps. A red CI run (failed RLS tests, failed OpenAPI drift check) still ships. Boot-time migrations (`main.ts:29-36`) are executed by the new container as part of that deploy, so a bad SQL file is applied to production by the act of merging. There is no `DEPLOY_PAUSED`, no DO deploy approval, and no documented rollback (DO keeps previous deployments; the migration ledger `schema_migration` is forward-only).
- **Impact:** A compromised contributor token or a careless merge is an immediate, unreviewed production change including DDL; CI's RLS isolation suite provides no protection for what actually ships.
- **Fix:** Set `deploy_on_push: false` and deploy from a GitHub Actions job that runs after `build-test` succeeds (`doctl apps create-deployment --wait`, token in GitHub Secrets with `permissions: { contents: read }` at the top of the workflow and `environment: production` with required reviewers). Enable branch protection on `main` requiring the CI check. Same for Vercel (Git integration → "Ignored Build Step" or deploy via `vercel deploy --prebuilt` from CI).
- **Effort:** M

### INFRA-11 — Every instance (including the `jobs` worker) runs every background job; the worker lacks the env to finish what it claims

- **Severity:** Medium  **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N — 5.9 (integrity of points/alerts)
- **Confidence:** Confirmed (code + spec); the exact proportion of lost alerts depends on whether Twilio vars were set app-wide in the DO dashboard (**Needs verification**)
- **Location:** `apps/api/src/modules/workers/worker-runner.service.ts:44-71`; `apps/api/src/main.ts:29`; `.do/app.yaml:56-77`; `apps/api/src/modules/workers/txn-alert.service.ts:44-72,156-168`; `expiry-sweep.service.ts:17-59`; `webhook.service.ts:185-224`
- **Evidence:**
  - `ROLE` is read only in `main.ts:29` to skip migrations. `WorkerRunner.onModuleInit` (`:44-49`) checks `SKIP_DB`, `NODE_ENV`, `WORKERS_ENABLED` — not `ROLE`. The `jobs` worker therefore runs the HTTP server (unreachable, no route) **and** all five intervals; so do both `api` instances → 3 concurrent runners.
  - `txn-alerts`: rows are claimed with `FOR UPDATE SKIP LOCKED` via `claim_txn_alerts` (`2026-08-03_claim_alerts_settled.sql:32`) and "marked handled whether or not the message got through" (`txn-alert.service.ts:44-46`). The `jobs` component has **no** `SMS_PROVIDER`, `TWILIO_*` or `TWILIO_TPL_*` vars (`.do/app.yaml:69-77`), so `send()` returns `false` at `:162-164` for every row the worker claims. Roughly the worker's share (~1/3 with equal polling) of transaction alerts are consumed and never delivered, with only a warn log.
  - `TWILIO_TPL_SALE_SUMMARY` and `TWILIO_TPL_CHALLENGE_COMPLETE` (`txn-alert.service.ts:29-30`) are absent from **both** components, so sale-summary and challenge-complete messages are never sent anywhere unless added by hand.
  - `point-expiry`: `sweepBrand` reads balances and posts a breakage journal with no row lock, advisory lock or idempotency key (`expiry-sweep.service.ts:19-53`). The hourly timers on all three instances start at container boot, which happens simultaneously on deploy, so ticks align. Two instances that both read `earned_expired − posted_debits` before either commits will each post the full expiry → customer points expired twice. READ COMMITTED does not prevent this.
  - `webhooks`: `deliverPending` selects `pending|failed` rows with no claim (`webhook.service.ts:186-191`) → the same delivery can be POSTed by two instances; merchants must dedupe on `X-Loyalty-Event-Id`.
  - `settlement` is safe (`idem: { key: 'settle:<id>' }`, `settlement.service.ts:67`).
  - The `jobs` component costs a `basic-xs` for no benefit and also connects BullMQ to Valkey (INFRA-20).
- **Impact:** Lost customer notifications (consent-sensitive, WhatsApp), possible double expiry of customer balances, duplicate webhooks; wasted spend.
- **Fix:** Either delete the `jobs` worker and keep intervals on the API (adding `pg_try_advisory_xact_lock(hash(brand_id))` around `sweepBrand`, and a `claimed_at` update-returning claim for webhook deliveries), or make it the **only** runner: `WORKERS_ENABLED=false` on `api`, `ROLE=worker` honoured in `WorkerRunner`, and give the worker the full Twilio/Resend/Apple/Google env. Add the two missing template vars to the spec.
- **Effort:** M

### INFRA-12 — Liveness-only health check, no readiness gating, no alerting

- **Severity:** Medium  **CVSS 3.1:** n/a (availability/operations)
- **Confidence:** Confirmed
- **Location:** `.do/app.yaml:19-20` (`health_check: http_path: /health`); `apps/api/src/platform-core/health/health.controller.ts:11-25`; no `alerts:` block in the spec
- **Evidence:** `/health` returns `{status:'ok'}` unconditionally (`:12-14`); `/ready` does `SELECT 1` (`:18-25`) but nothing calls it. DO therefore keeps routing to an instance whose Prisma pool is exhausted or whose DB connection is gone, and a deploy is declared healthy the moment the port opens (migrations run before `listen`, which is correct, but Prisma `$connect` failure in `onModuleInit` is not surfaced by `/health`). There are no DO alerts for deployment failure, CPU, memory or restart count, and `docs/security.md:21` lists monitoring as unchecked.
- **Impact:** Silent partial outage: one of two instances serving 500s indefinitely; nobody paged on OOM-restart loops (INFRA-09).
- **Fix:** Point `health_check.http_path` at `/ready` with `initial_delay_seconds`, `period_seconds: 10`, `failure_threshold: 3`; add `alerts: [{rule: DEPLOYMENT_FAILED}, {rule: DOMAIN_FAILED}, {rule: CPU_UTILIZATION, value: 80, window: FIVE_MINUTES}, {rule: MEM_UTILIZATION, value: 80, …}, {rule: RESTART_COUNT, value: 3, …}]` to the spec; ship pino logs to a DO log forward destination with retention.
- **Effort:** S

### INFRA-13 — Environment validation covers 14 of ~55 variables; production features fail silently

- **Severity:** Medium  **CVSS 3.1:** n/a (configuration integrity)
- **Confidence:** Confirmed
- **Location:** `apps/api/src/config/env.ts:4-26`; full matrix below
- **Evidence:** `envSchema` validates only DB URLs, JWT secrets/TTLs, port, region/currency. Everything else is read ad hoc with `config.get` and a `configured` getter that quietly disables the feature: Apple passes (`apple-wallet.service.ts:85-92`), APNs (`apns.service.ts:34-40`), Google Wallet (`google-wallet.service.ts:30-36`), Resend email (`email.service.ts:26-30`), Twilio (`sms-sender.service.ts:37-52`). A typo in a DO secret name produces a green deploy with no wallet passes, no emails, or OTP codes written to logs (INFRA-16). `API_BASE_URL` is validated (`env.ts:7`) but never read anywhere. `JWT_*_SECRET` require only 16 characters (`env.ts:17-18`); the `.env.example` placeholders `dev-access-secret-change-me` (`:17-18`) satisfy that and would be accepted in production.
- **Fix:** A production-mode superset schema (`z.discriminatedUnion` on `NODE_ENV`) that requires `CORS_ORIGINS`, `PII_MASTER_KEY_BASE64` (32 bytes), `APP_DATABASE_URL` (must not equal `DATABASE_URL`, must not contain `postgres.` user), `SMS_PROVIDER` + Twilio set, `RESEND_API_KEY`, `PUBLIC_API_URL`, and `min(32)` on JWT secrets with a denylist of the example values. Log the list of **disabled** integrations at boot at `error` level in production.
- **Effort:** S

### INFRA-14 — Nine tables have no RLS; if the Supabase Data API (PostgREST) is enabled for `public`, they are readable with the public `anon` key

- **Severity:** Medium (High if confirmed)  **CVSS 3.1 if exposed:** AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N — 7.5
- **Confidence:** Needs verification (Supabase project → Settings → API → "Exposed schemas"; and `GRANT`s to `anon`/`authenticated`)
- **Location:** `packages/db/prisma/sql/rls.sql:88-101,117-140,188,209`; `2026-07-28_person_access_and_receipts.sql:103-106`; `rls.sql:80-82`; `packages/db/prisma/sql/*.sql` `CREATE TABLE` set
- **Evidence:** Diffing the 61 `CREATE TABLE`s against every `ENABLE ROW LEVEL SECURITY` (rls.sql loops + the four incremental files) leaves these tables with **no RLS at all**:

  | Table | Why it matters if exposed |
  |---|---|
  | `receipt` | Deliberately un-gated (`person_access_and_receipts.sql:103`): order numbers, amounts, line items, brand, membership link, the public token itself |
  | `push_token` | Expo/APNs device tokens per person → targeted push spam |
  | `pass_registration` | Apple device library IDs + pass serials + push tokens |
  | `pass_state` | Per-membership pass data (balance, name) |
  | `account_deletion` | Who requested erasure and when |
  | `impersonation_session` | Which superadmin acted as which brand (`rls.sql:80-82` says intentionally not under RLS) |
  | `rbac_role`, `rbac_permission`, `rbac_role_permission` | Reference data (low sensitivity) |

  Tables that **do** have RLS carry policies `TO loyalty_app` only; for `anon`/`authenticated` the default-deny applies, so those are safe even with the Data API on. `otp_code` is RLS-enabled with no policy (`2026-07-28_otp_code.sql:20`) — correct. The application never uses `supabase-js`, an anon key or PostgREST (grep across `apps/` and `packages/` finds no client), so the Data API has **no legitimate consumer** and can be disabled outright. Note that Supabase's `postgres` role is not a true superuser, but `GRANT … TO anon` is auto-applied by Supabase's default privileges only for tables created through its own tooling; tables created via raw `psql`/`pg` with the `postgres` role still inherit `ALTER DEFAULT PRIVILEGES` set by Supabase for `anon`/`authenticated`/`service_role` on `public` — this is the part to verify with `SELECT grantee, table_name FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated');`.
- **Impact:** Receipt contents and device push tokens for every merchant readable by anyone holding the anon key (which is public by design); `service_role` key (if ever leaked) bypasses RLS everywhere.
- **Fix:** Disable the Data API or set "Exposed schemas" to none; `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` and `ALTER DEFAULT PRIVILEGES … REVOKE`; enable RLS with a deny-all policy on the nine tables (the API reads `receipt` by token through `loyalty_app`, which can keep a `USING (true)` policy scoped `TO loyalty_app`).
- **Effort:** S

### INFRA-15 — No WAF or DDoS protection in front of the API; unauthenticated, unthrottled compute endpoints on one shared vCPU

- **Severity:** Medium  **CVSS 3.1:** AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L — 5.3 (A:H / 7.5 once INFRA-03 is fixed and buckets become per-IP without a global budget)
- **Confidence:** Confirmed (code); DO's network-level DDoS mitigation is **Needs verification** (App Platform has L3/L4 mitigation but no L7 WAF)
- **Location:** `apps/api/src/modules/wallet-pass/passkit-web.controller.ts:26,99,128-133`; `passkit.service.ts:168-172`; `apps/api/src/modules/terminal-gateway/terminal.controller.ts:23`; `receipt-public.controller.ts:47-58`; `docs/security.md:18` (WAF unchecked)
- **Evidence:**
  - `POST /v1/log` (`passkit-web.controller.ts:128-133`): no auth, class-level `@SkipThrottle()`, writes up to 20 × 300 chars of attacker-controlled text per request to the warn log (`passkit.service.ts:169-171`). Unlimited log-volume cost and log injection (lines are not escaped; pino JSON-encodes, so structured parsers are safe, but DO's log viewer and any grep-based alerting are not).
  - `GET /v1/r/:token/pdf`: unauthenticated PDF generation with `pdfkit` per request, plus two DB round-trips; covered only by the 300/min global bucket (INFRA-03).
  - Terminal controller `@SkipThrottle()` (`terminal.controller.ts:23`): the HMAC guard rejects unsigned requests cheaply, but each rejection still hits `AuthPrismaService` (owner connection) to look up the key — an unbounded DB-query amplifier from the internet.
  - Once `trust proxy` is set (INFRA-03), the OTP endpoint becomes 5 req/min **per IP** with no platform-wide ceiling: 1,000 IPs × 5/min = 5,000 WhatsApp/SMS per minute. At Twilio's UAE authentication-template rates (order of US$0.03–0.05 per message) that is roughly US$150–250 per minute, US$10k+ per hour, bounded only by the per-phone cap of 5 per 15 min (`otp-store.service.ts:13-14`) which an attacker defeats by rotating numbers (any E.164 passes `OtpRequestDto`, including premium/foreign numbers).
- **Fix:** Put Cloudflare (or DO's upcoming App Platform WAF) in front of `api.partnerspoints.ae` with rate rules on `/v1/customer/auth/*` and `/v1/log`, bot management, and country allowlist on OTP (UAE + GCC prefixes). Add a Redis-backed global OTP budget and a per-prefix cost cap. Add `@Throttle` to `/v1/log` and `/v1/r/:token/pdf`, and make the terminal HMAC guard cache key lookups.
- **Effort:** M

### INFRA-16 — OTP codes and phone numbers are written to production logs on any SMS misconfiguration

- **Severity:** Medium  **CVSS 3.1:** AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:N — 5.9 (needs DO log access, which every team member with app access has)
- **Confidence:** Confirmed (code); whether it is currently happening is **Needs verification**
- **Location:** `apps/api/src/auth/otp/sms-sender.service.ts:37-42,71-76,93-95`; `.do/app.yaml:35-49`
- **Evidence:** `provider` resolves to `'none'` when **any** of `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` or both `TWILIO_FROM`/`TWILIO_MESSAGING_SERVICE_SID` are empty; then `sendCode` logs `[OTP NOT SENT …] ${phone} -> ${code}` at `warn` and the HTTP response is still 200 with `delivered:false`. The template path logs `contentSid -> phone`. DO App Platform retains runtime logs and exposes them to all team members; log forwarding (if configured) copies them again.
- **Impact:** Anyone with log access can sign in as any customer who requested a code during the misconfiguration window; phone numbers (PII under PDPL) are in logs in every path regardless.
- **Fix:** In production never log the code — log only the phone hash prefix; make a `'none'` provider a boot-time error when `NODE_ENV=production`; add a pino `redact` path for `phone`. Agent 10 to assess log retention.
- **Effort:** S

### INFRA-17 — `/metrics`, `/ready` and `X-Request-Id` are unauthenticated surfaces that leak process details and accept attacker-controlled log values

- **Severity:** Medium (combined; individually Low)  **CVSS 3.1:** AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N — 6.5
- **Confidence:** Confirmed
- **Location:** `health.controller.ts:31-42`; `app.module.ts:52-57`
- **Evidence:** `/metrics` returns `pid`, `node` version, RSS and heap to anyone (`:33-41`) — version fingerprinting for CVE targeting; `/ready` lets an attacker probe DB connectivity cheaply (one `SELECT 1` per hit, no throttle override). `genReqId` echoes the client's `x-request-id` header straight into the `X-Request-Id` response header and into every log line without length or charset limits (`:52-56`) — arbitrary 8 KB strings into logs per request.
- **Fix:** Restrict `/metrics` to the DO internal network or an auth header; cap `x-request-id` to `/^[A-Za-z0-9._-]{1,64}$/` else regenerate.
- **Effort:** S

### INFRA-18 — No graceful shutdown: SIGTERM on every deploy drops in-flight requests and job passes

- **Severity:** Low  **CVSS 3.1:** n/a
- **Confidence:** Confirmed
- **Location:** `apps/api/src/main.ts:38-74` (no `app.enableShutdownHooks()`; grep for `SIGTERM|enableShutdownHooks` across `apps/api/src` is empty); `worker-runner.service.ts:73-75`
- **Evidence:** Without shutdown hooks Nest's `onModuleDestroy` never runs on SIGTERM; Node exits immediately. Open HTTP connections are reset mid-response, Prisma connections are dropped (Postgres rolls the transaction back atomically, so the ledger stays consistent), and an in-progress `sweepBrand`/`deliverPending` pass is cut off. Terminals retry with idempotency keys, but a capture whose commit succeeded and whose response was lost appears as a failed redemption at the till.
- **Fix:** `app.enableShutdownHooks()`; stop accepting connections, wait for in-flight requests (≤ 25 s; DO allows 30 s), clear worker timers, then `$disconnect`.
- **Effort:** S

### INFRA-19 — CI workflow: default `GITHUB_TOKEN` permissions, unpinned third-party actions, demo password printed in logs

- **Severity:** Low  **CVSS 3.1:** n/a
- **Confidence:** Confirmed
- **Location:** `.github/workflows/ci.yml:38,44,46,90`; `packages/db/prisma/seed.ts:273`
- **Evidence:** No top-level `permissions:` block (token gets the repo default, often `write`); `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4` are mutable major tags, not SHAs; the smoke step runs `pnpm --filter @rfm-loyalty/db seed`, which prints `Demo login password for all seeded admins: ChangeMe123!` on every run. No dependency-audit, secret-scanning or container-scanning job.
- **Fix:** `permissions: { contents: read }`; pin actions to commit SHAs (Dependabot `github-actions` ecosystem); drop the password print; add `pnpm audit --prod`, gitleaks and Trivy on the built image.
- **Effort:** S

### INFRA-20 — BullMQ scheduler connects to Valkey from all three instances and enqueues jobs nobody consumes

- **Severity:** Low  **CVSS 3.1:** n/a
- **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/workers/worker-scheduler.ts:16-37`; `.do/app.yaml:29,74`; `docs/deployment.md:20` (claims the opposite)
- **Evidence:** With `REDIS_URL` set, each instance opens a Redis connection and adds four repeatable jobs to `rfm-maintenance`; no `Worker` exists anywhere. The managed Valkey cluster is therefore a paid, internet-reachable (`rediss://…:25061`) dependency with a credential distributed to three containers for zero function, while the one thing it *should* back (throttle + nonce store, `nonce-store.service.ts` TODO) still runs in memory.
- **Fix:** Remove `WorkerScheduler` and `bullmq`, or finish the consumer; repurpose `REDIS_URL` for the throttler and HMAC nonce store; restrict Valkey's trusted sources to the app's egress.
- **Effort:** S

### INFRA-21 — Region `fra` (EU) hosts UAE customer PII; no residency controls exist despite the design docs

- **Severity:** Low (compliance; handed to agent 10)  **CVSS 3.1:** n/a
- **Confidence:** Confirmed
- **Location:** `.do/app.yaml:5`; `docs/deployment.md:32-35`; `.env.example:7` (`aws-0-<region>`)
- **Evidence:** API in Frankfurt; Supabase region unknown (**Needs verification**); `docs/deployment.md:35` acknowledges "Supabase/DO have no UAE region today … UAE PDPL permits cross-border transfer with safeguards", but no safeguards (DPA, transfer assessment, per-tenant pinning the docs promise) are evidenced in the repo. Twilio and Resend process phone numbers/emails in the US.
- **Fix:** Document the transfer basis; evaluate DO/Supabase `blr`/`bom` or a UAE sovereign host for the DB if a merchant contract requires it.
- **Effort:** L

### INFRA-22 — Hard-coded production URLs as fallbacks make staging impossible to isolate

- **Severity:** Low  **CVSS 3.1:** n/a
- **Confidence:** Confirmed
- **Location:** `terminal.service.ts:424`, `apple-wallet.service.ts:202`, `wallet-pass.service.ts:108`, `receipt-public.controller.ts:141`, `wallet.service.ts:272`
- **Evidence:** `process.env.PUBLIC_API_URL ?? 'https://api.partnerspoints.ae/v1'` etc. A staging deploy without these vars prints production receipt links on test tills, advertises the production PassKit web service in test passes, and emails production app links.
- **Fix:** Require the URLs in production validation (INFRA-13) and default to `API_BASE_URL` (already validated) elsewhere.
- **Effort:** S

### INFRA-23 — Vercel consoles ship with no platform security headers or protection settings in code

- **Severity:** Low (detail owned by agent 06)  **CVSS 3.1:** n/a
- **Confidence:** Confirmed (repo); Vercel project settings **Needs verification**
- **Location:** `apps/web-brand/vercel.json`, `apps/web-superadmin/vercel.json`, their `next.config.mjs` (no `headers()`); contrast `apps/docs/next.config.mjs:14-26`
- **Evidence:** Vercel adds HSTS automatically on production domains, but `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Referrer-Policy` and CSP are absent for both consoles; no `regions`, no Vercel WAF rules or Deployment Protection evidenced; `eslint.ignoreDuringBuilds: true` in all three. The superadmin console (`superadmin.platform.partnerspoints.ae`) is reachable from the public internet with no IP allowlist.
- **Fix:** Copy the docs portal `headers()` into both consoles (plus a CSP); enable Vercel Firewall IP allowlist or Vercel Authentication on the superadmin project.
- **Effort:** S

### INFRA-24 — Local developer stack weakens assurances: owner role in `.env`, `enable-pre-post-scripts`, world-readable secrets

- **Severity:** Low  **CVSS 3.1:** n/a
- **Confidence:** Confirmed
- **Location:** `.env:1-3` (comment: "Uses the owner role for dev convenience"); `.npmrc:4` (`enable-pre-post-scripts=true`); `secrets/*` mode `-rw-r--r--`
- **Evidence:** Development runs with RLS bypassed, so an RLS regression is only caught by `packages/db/test/rls.test.ts`, never by hand. `enable-pre-post-scripts` plus `onlyBuiltDependencies` (`package.json:30-39`) is fine, but `auto-install-peers=true` can pull unlisted packages.
- **Fix:** Use `APP_DATABASE_URL` with `loyalty_app` locally (`dev-db.ts` can create the role); `chmod 600` secrets.
- **Effort:** S

### INFRA-25 — Documentation drift between `DEPLOYMENT.md`, `docs/deployment.md`, the spec and the code

- **Severity:** Info
- **Confidence:** Confirmed
- **Evidence:** `docs/deployment.md:20` says `REDIS_URL` "enables" settlement/webhook/expiry jobs (false — INFRA-11/20); `.do/app.yaml:66-67` says the worker "registers the BullMQ processors" (none exist); `DEPLOYMENT.md:0` instructs rotating a DB password that "was shared in chat" (confirms the owner password circulated outside a secret store — **verify it was rotated**); `docs/security.md:14-21` checklist is entirely unchecked, including "confirm the app uses `APP_DATABASE_URL` … never the owner".
- **Fix:** Collapse to one runbook generated from the spec; add a "verified on <date>" line per control.

### INFRA-26 — Dockerfile `HEALTHCHECK` and `EXPOSE` are inert on App Platform

- **Severity:** Info
- **Confidence:** Confirmed
- **Location:** `Dockerfile:39-41`
- **Evidence:** DO uses `health_check.http_path` and `http_port`; the image-level healthcheck only matters for `docker run`. Harmless, but it gives a false sense that DB readiness is probed (it is not — INFRA-12).

---

## Environment variable matrix

Legend: **env.ts** = validated in `apps/api/src/config/env.ts`; **api** / **jobs** = present in `.do/app.yaml` for that component; **.env.example** = documented. "—" = absent.

| Variable | Read at (file:line) | env.ts | api | jobs | .env.example | Note |
|---|---|---|---|---|---|---|
| `NODE_ENV` | main.ts:67, app.module.ts:64, all-exceptions.filter.ts:59, worker-runner.service.ts:45, pii-backfill.service.ts:28 | enum, default `development` | ✔ | ✔ | ✔ | Dockerfile also sets |
| `API_PORT` | main.ts:73 | ✔ | ✔ | — (Dockerfile ENV) | ✔ | |
| `API_BASE_URL` | env.ts:7 only | ✔ | — | — | ✔ | validated but **never read** |
| `LOG_LEVEL` | app.module.ts:51 | ✔ default | — | — | ✔ | |
| `DATABASE_URL` | prisma.service.ts:16, auth-prisma.service.ts:19, schema-migrator.ts:132, openapi-export.ts:14 | required | ✔ | ✔ | ✔ | **owner** credential (INFRA-01) |
| `APP_DATABASE_URL` | prisma.service.ts:16 | optional | ✔ | ✔ | ✔ | should be required in prod |
| `DIRECT_URL` | auth-prisma.service.ts:19, schema-migrator.ts:132 | optional | ✔ | — | ✔ | owner; auth path uses it at runtime |
| `REDIS_URL` | worker-scheduler.ts:17 | — | ✔ | ✔ | ✔ | dead path (INFRA-20) |
| `JWT_ACCESS_SECRET` | token.service.ts:48-107, apple-wallet.service.ts:213, passkit.service.ts:42, openapi-export.ts:15 | min 16 | ✔ | ✔ | ✔ | also keys pass auth HMAC |
| `JWT_REFRESH_SECRET` | token.service.ts:55,68 | min 16 | ✔ | ✔ | ✔ | |
| `JWT_ACCESS_TTL_SECONDS` | token.service.ts:49, auth.service.ts:292 | default 900 | — | — | ✔ | |
| `JWT_REFRESH_TTL_SECONDS` | token.service.ts:56, auth.service.ts:345 | default 30 d | — | — | ✔ | |
| `TOTP_ISSUER` | totp.service.ts:16 | default | — | — | ✔ | |
| `TERMINAL_HMAC_SKEW_SECONDS` | terminal-hmac.guard.ts:54 | default 300 | — | — | ✔ | |
| `DEFAULT_REGION` / `DEFAULT_CURRENCY` | env.ts:24-25 | default | ✔ | — | ✔ | |
| `PII_MASTER_KEY_BASE64` | envelope-crypto.service.ts:16 | **—** | ✔ | ✔ | ✔ | not validated; dev-key fallback (INFRA-02) |
| `CORS_ORIGINS` | main.ts:44 | — | **—** | — | — | reflect-any-origin in prod (INFRA-07) |
| `API_DOCS_ENABLED` | main.ts:67 | — | — | — | — | absent = docs off (good) |
| `ROLE` | main.ts:29 | — | — | ✔ | — | only skips migrations |
| `SKIP_DB`, `SKIP_MIGRATIONS` | main.ts:30, prisma.service.ts:21, auth-prisma.service.ts:24, worker-*.ts | — | — | — | — | test/CI switches; a stray `SKIP_MIGRATIONS=1` in prod skips schema |
| `WORKERS_ENABLED` | worker-runner.service.ts:46 | — | — | — | — | all instances run jobs (INFRA-11) |
| `SMS_PROVIDER` | sms-sender.service.ts:38 | — | ✔ (`twilio`) | **—** | — | worker → provider `none` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` | sms-sender.service.ts:46-48,128-130 | — | ✔ | **—** | — | |
| `TWILIO_FROM` | sms-sender.service.ts:49,131 | — | ✔ | — | — | |
| `TWILIO_MESSAGING_SERVICE_SID` | sms-sender.service.ts:50,132 | — | — | — | — | documented alternative, not in spec |
| `TWILIO_CHANNEL`, `TWILIO_CONTENT_SID` | sms-sender.service.ts:106-107,133 | — | ✔ | — | — | |
| `TWILIO_TPL_WELCOME/EARNED/REDEEMED/ADJUSTED` | txn-alert.service.ts:25-28,161 | — | ✔ | **—** | — | worker drops claimed alerts |
| `TWILIO_TPL_SALE_SUMMARY`, `TWILIO_TPL_CHALLENGE_COMPLETE` | txn-alert.service.ts:29-30,161 | — | **—** | **—** | — | never sent anywhere |
| `SMS_HTTP_URL`, `SMS_HTTP_TOKEN`, `SMS_SENDER_ID` | sms-sender.service.ts:40,180-182 | — | — | — | — | alt provider |
| `RESEND_API_KEY`, `EMAIL_FROM` | email.service.ts:26-30,46 | — | ✔ | **—** | — | |
| `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID` | apple-wallet.service.ts:87-88,102-103, passkit.service.ts:29, apns.service.ts:38 | — | **—** | — | — | set by hand or feature silently off |
| `APPLE_PASS_CERT_P12`, `APPLE_PASS_CERT_PASSWORD`, `APPLE_WWDR_CERT_PEM` | apple-wallet.service.ts:89-90,259-284 | — | **—** | — | — | p12 + password as env (INFRA-05) |
| `APPLE_APNS_KEY_P8`, `APPLE_APNS_KEY_ID` | apns.service.ts:36-37,44,55; apple-wallet.service.ts:205 | — | **—** | — | — | |
| `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_PRIVATE_KEY` | google-wallet.service.ts:32-44,120,174 | — | **—** | — | — | SA private key as env |
| `PUBLIC_API_URL` | terminal.service.ts:424, apple-wallet.service.ts:202, wallet-pass.service.ts:108 | — | — | — | — | hard-coded prod fallback (INFRA-22) |
| `PUBLIC_SITE_URL` | passkit.service.ts:129, wallet-pass.service.ts:31 | — | — | — | — | |
| `APP_URL`, `APP_SITE_URL`, `APP_STORE_URL`, `PLAY_STORE_URL` | wallet.service.ts:272, receipt-public.controller.ts:141-146 | — | — | — | — | |
| `APP_MIN_VERSION`, `APP_MAINTENANCE`, `APP_MAINTENANCE_MESSAGE` | app-status.controller.ts:26-29 | — | — | — | — | kill-switch not in spec |
| `ACCOUNT_DELETION_NOTICE_DAYS` | deletion.service.ts:28 | — | — | — | — | |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BRAND_URL` | Vercel consoles | n/a | n/a | n/a | ✔ | |

Totals: 55 distinct variables read by the API; 14 validated; 29 present in the `api` spec; 7 in `jobs`; 18 documented in `.env.example`. 26 are read in code and absent from the DO spec — each is either a silently disabled feature or a hard-coded production fallback.

---

## Not assessed (access required)

| Gap | What would close it |
|---|---|
| Actual DO env values: is `APP_DATABASE_URL` the `loyalty_app` login (INFRA-01)? Is `PII_MASTER_KEY_BASE64` 32 bytes (INFRA-02)? Is `CORS_ORIGINS` set (INFRA-07)? Were Twilio/Apple/Google vars added app-level or component-level (INFRA-11)? | Read-only DO App Platform dashboard access to the `rfm-loyalty` app (Settings → env vars, names and scopes only) |
| `basic-xs` memory/CPU, restart history, OOM events, deploy log of the migrator | DO app Insights + Runtime Logs |
| Scope of `.do-token` | `doctl auth list` / DO API Tokens page (do not paste the token) |
| Supabase: Enforce SSL, Data API exposed schemas, `anon`/`authenticated` grants, network restrictions/IP allowlist, PITR/backups, project region | Supabase dashboard (Settings → Database / API) and one read-only SQL session for `pg_roles`, `role_table_grants`, the INFRA-04 user query |
| Whether seed data / `superadmin@rfm-loyalty.dev` exists in production (INFRA-04) | Same read-only SQL session |
| DO LB behaviour (`X-Forwarded-For`, source IP at socket) | One request to `/v1/customer/app-status` from a known IP while tailing logs (out of scope for this read-only audit) |
| Valkey trusted sources, TLS, eviction, auth | DO Databases dashboard |
| Vercel: Deployment Protection, Firewall rules, env scoping, team membership, Git integration permissions | Vercel project settings for the three projects |
| GitHub: branch protection on `main`, DO/Vercel GitHub App permissions, secret scanning / Dependabot status | Repository settings |
| DNS/TLS: CAA, HSTS preload, cert issuer for `api.partnerspoints.ae` | Public DNS/TLS probe (not run per rules) |
| Twilio: geo-permissions, spending caps, Verify vs. raw messaging | Twilio console |

## Positive controls verified

- Boot migrations are serialised with `pg_advisory_lock(4820117)` and are per-file transactional with a checksum ledger (`schema-migrator.ts:39,151-181`); the migration list is single-sourced (`packages/db/src/migrations.ts`) and exercised twice in CI.
- Runtime data access uses the non-owner `loyalty_app` role when `APP_DATABASE_URL` is set (`prisma.service.ts:16`); tenant GUCs are set per transaction with `set_config(…, true)` (`tenant.service.ts:30`), which is transaction-pooler safe.
- Pre-context paths (OTP issue/verify, wallet reads, alert claiming, terminal enrolment) are wrapped in `SECURITY DEFINER` functions with `REVOKE ALL … FROM public` and `GRANT EXECUTE … TO loyalty_app` (`2026-07-28_customer_wallet.sql:201-215`, `otp_code.sql:92-98`, etc.).
- OTP codes are stored hashed, rate-limited per phone in the DB (5 sends / 15 min, 5 attempts, 5-minute TTL) and verified with `FOR UPDATE` (`otp-store.service.ts:9-14`, `otp_code.sql:69`), so they survive instance restarts.
- Transaction-alert claiming uses `FOR UPDATE SKIP LOCKED`; settlement is idempotent via ledger idempotency keys.
- Swagger is off in production unless `API_DOCS_ENABLED=true` (`main.ts:66-71`); `API_DOCS_ENABLED` is absent from the spec.
- Helmet defaults (including HSTS) are applied (`main.ts:41`); the public receipt page sets its own strict CSP (`receipt-public.controller.ts:27`).
- `ValidationPipe({ whitelist, forbidNonWhitelisted })` is global (`main.ts:53-55`); error bodies hide internals in production (`all-exceptions.filter.ts:59`).
- Pino redacts `authorization`, `cookie`, `x-api-key` (`app.module.ts:58`); JSON transport in production (`:63-66`).
- Multi-stage Docker build: the runtime image contains only `pnpm deploy --prod` output plus SQL, not the source tree or dev dependencies (`Dockerfile:19,34,38`); CI verifies that no runtime import depends on a pruned devDependency (`ci.yml:79-80`).
- `.env` has never been committed (`git log --all --diff-filter=A -- .env` is empty); `secrets/`, `.do-token`, `*.p12`, `*.p8`, `*.keystore` are gitignored (the terminal keystore pre-dates the rule and remains tracked — agent 05).
- The Valkey URL is `rediss://` (TLS) per `.env.example:14`.
- CI runs the cross-tenant RLS suite against a fresh Postgres on every PR and checks OpenAPI drift and a full HTTP smoke test.
