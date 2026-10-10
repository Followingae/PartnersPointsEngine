# 08 — Secrets & Supply Chain

Audit date: 2026-10-10. Repo `Followingae/PartnersPointsEngine`, local `main` @ afc3fe2 = `origin/main`. Read-only: no source edits, no commits, no history rewrites, no production contact. Network used only for the npm registry (`pnpm audit`, `pnpm licenses`) and read-only GitHub REST calls about the repository itself. APKs were unzipped into the session scratchpad only.

Secret values found during the audit are deliberately NOT reproduced in this document (the `AUDIT/` folder sits inside a repository that is currently public, see SC-02). Locations are given as file:line.

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | SC-01 |
| High | 4 | SC-02, SC-03, SC-04, SC-05 |
| Medium | 8 | SC-06, SC-07, SC-08, SC-09, SC-10, SC-11, SC-12, SC-13 |
| Low | 3 | SC-14, SC-15, SC-16 |
| Info | 3 | SC-17, SC-18, SC-19 |

`pnpm audit` (whole workspace, 1,539 resolved packages): **8 critical / 83 high / 45 moderate / 4 low** findings across 116 advisory entries. Of those, 17 are reachable in the API's production dependency graph and 12 affect the three Next.js consoles; the rest are mobile/API build tooling (details in SC-06, SC-18 and Appendix A).

The single most important fact: **the GitHub repository is public** (`"private": false`, confirmed unauthenticated), and it contains the Android release keystore plus its plaintext passwords. The raw file is served anonymously (HTTP 200 on `raw.githubusercontent.com/.../main/apps/terminal-android/keystore.properties`). That key is the one that signed the fleet APKs v2.4 and v2.6 (certificate SHA-256 `75d1d698…b5300c` matches in `apksigner` output and `keytool -list` on the committed keystore).

---

## Findings

### SC-01 — Android fleet signing keystore and its passwords are committed to a public repository
- **Severity:** Critical (unrevocable identity; enables fleet code execution). CVSS 3.1: `AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:H/A:H` = **8.3** (score understates it because the key cannot be rotated for already-installed apps).
- **Confidence:** Confirmed.
- **Location:** `apps/terminal-android/keystore.properties:1-4` (storeFile, storePassword, keyAlias, keyPassword in plaintext); `apps/terminal-android/keystore/rfmhub.keystore` (PKCS12, alias `rfmhub`, PrivateKeyEntry, CN=RFM Loyalty Co, OU=Merchant Hub, valid 2026-07-09 to 2056-07-01). Both added in commit `c3d32f4d9d775957764961f6af04f900eda385c4` (2026-07-28, "Merchant terminal app (Feitian SmartPay)…"), present in HEAD on all three branches (`main`, `pass-strip-design`, `store-readiness`) and on `origin/main` (`git merge-base --is-ancestor c3d32f4 origin/main` = true; `git ls-tree origin/main` lists both paths).
- **Evidence:**
  - `git log --all --follow` for both paths shows exactly one commit, c3d32f4, never removed.
  - `.gitignore:52-53` (`*.keystore`, `*.jks`) was added after the fact; it is ineffective because git ignore rules never apply to already-tracked files.
  - `apps/terminal-android/app/build.gradle.kts:8-12,25-31` reads `keystore.properties` and uses it as the release `signingConfig`, so this is the live release key, not a leftover.
  - `apksigner verify --print-certs` on `apps/terminal-android/RFM-Terminal-v2.6.apk` and `RFM-Terminal-v2.4.apk`: Signer #1 SHA-256 = `75d1d69876be719ec5004e353989488dbf4f23dda82466db1e7634c3f6b5300c`. `keytool -list -v` on the committed keystore (using the committed password): SHA256 `75:D1:D6:98:…:B5:30:0C`. Same key.
  - Repository is public (SC-02); the file is fetchable with no credentials.
  - OU=Merchant Hub and `README.md:12` ("same toolchain as the RFM Merchant Hub") suggest this keystore may also sign a second app; Needs verification.
- **Impact:** Anyone can build an APK that Android's package manager accepts as a legitimate update of `ae.rfmloyaltyco.terminal` on every Feitian terminal in the estate. The terminal app holds the HMAC pairing secret (`SettingsStore.kt`), drives SmartPay payment via the ECR SDK, posts earn/redeem transactions, and prints receipts. A malicious update means stolen pairing secrets, forged loyalty transactions, and tampering with the cashier flow on a payment device.
- **Exploit scenario:** (1) Fetch keystore + password from the public repo. (2) Build a trojaned APK with `versionCode > 17`, signed with the key. (3) Delivery: either via the self-update channel (needs a superadmin token or DB write to `terminal_release`, see SC-13), via USB/ADB on a terminal, or by social-engineering a cashier into sideloading "the new update" (the signature check is the only thing Android verifies, and it passes). No signature mismatch is ever raised because the attacker holds the genuine key.
- **Fix (effort L):**
  1. **Make the repository private now** (SC-02), then remove the two files from the working tree and purge them from all branches with `git filter-repo --invert-paths --path apps/terminal-android/keystore.properties --path apps/terminal-android/keystore/rfmhub.keystore`, force-push all branches, and ask GitHub Support to purge cached views and any PR/commit refs. Treat the key as compromised regardless: it was public for ~10 weeks (0 forks/0 stars reduces but does not eliminate scraping risk).
  2. Generate a new release key offline (never inside the repo); store it in a secrets manager / password vault; provide `keystore.properties` to the build via environment variables or a CI secret, and keep `build.gradle.kts` falling back to an empty signing config so a missing file fails the build loudly.
  3. **Rotate the signing identity on the fleet.** Android only trusts updates from the same signer, so one of: (a) APK Signature Scheme v3 key rotation with a signing lineage (`apksigner rotate` + `--lineage`), which works on Android 9+ (API 28+; `minSdk = 24`, so confirm the Feitian SmartPay OS level, Needs verification); the rotation APK must still be signed with the OLD key once, so it must be shipped before any attacker-signed build lands; or (b) uninstall/reinstall on every terminal with a new-key build (and re-pair, because `SettingsStore` prefs are lost with uninstall).
  4. Rotate every terminal HMAC pairing secret after the fleet is re-signed (`POST /v1/admin/terminals/:id/keys` path in `superadmin.service.ts:920-934`), since an attacker-signed build could have exfiltrated them.
  5. Add a pre-commit / CI secret scanner (gitleaks or GitHub push protection is already on, see Positive controls, but it does not scan binary keystores).

### SC-02 — The entire monorepo is a public GitHub repository with no branch protection
- **Severity:** High. CVSS 3.1: `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` = **7.5**.
- **Confidence:** Confirmed.
- **Location:** GitHub `Followingae/PartnersPointsEngine` (`.do/app.yaml:13`, `git remote -v`).
- **Evidence:** `GET /repos/Followingae/PartnersPointsEngine` unauthenticated: `"private": false, "visibility": "public", "allow_forking": true, "pull_request_creation_policy": "all", "license": null, forks 0, stars 0, created 2026-06-16`. `GET …/branches/main/protection` → 404 "Branch not protected"; `GET …/rulesets` → `[]`. `GET …/vulnerability-alerts` → 404 (Dependabot alerts off); `security_and_analysis.dependabot_security_updates = disabled`.
- **Impact:** Besides SC-01, the following is public: all API source (auth, RLS policies, ledger engine, HMAC canonicalisation), the DO App Platform spec with every secret name, `DEPLOYMENT.md:15-18` stating the Supabase DB password "was shared in chat", `docs/phase-1-status.md:45` naming a Supabase project ref (`uxaozlqxiwwaucrfokuk`), `packages/db/prisma/seed.ts:16,124` (demo superadmin e-mail + password), the hard-coded PII dev-key string (SC-03), `apps/mobile/eas.json` (`ascAppId` 6798199041), the EAS project id, and the vendored Feitian SDK binaries (possible licence issue with Feitian, Needs verification). This is a large head start for any attacker and turns several "defence in depth" assumptions into known-plaintext ones.
- **Exploit scenario:** Any internet user clones the repo and uses SC-01, SC-03 or SC-09 directly. Any collaborator (or a compromised collaborator account, no signed-commit requirement) can push to `main`, which deploys to production on both DO (`deploy_on_push: true`, `.do/app.yaml:15,56`) and Vercel with no review and no required CI status.
- **Fix (effort S):** Set the repository to private. Add a ruleset on `main`: require PR, 1 reviewer, required status check `build-test`, block force-push, require signed commits. Enable Dependabot alerts + security updates. Decide whether a public repo was ever intended; if it was, a licence and a public-safe split are prerequisites, not an afterthought.

### SC-03 — PII/secret envelope key silently falls back to a hard-coded (now public) dev key
- **Severity:** High. CVSS 3.1: `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N` = **7.4**. Confidence: Confirmed in code; whether production has ever run without the key is **Needs verification**.
- **Location:** `apps/api/src/auth/crypto/envelope-crypto.service.ts:16-22`; `apps/api/src/config/env.ts:4-27` (`PII_MASTER_KEY_BASE64` is absent from `envSchema`, so boot validation never checks it).
- **Evidence:** If `PII_MASTER_KEY_BASE64` is missing or not exactly 32 bytes, the service logs a warning and uses `sha256('rfm-loyalty-dev-key')`. That key now encrypts: terminal HMAC signing secrets (`ApiKey.secretEnc`, consumed by `terminal-hmac.guard.ts:65-70`), customer phone numbers (`Person.phoneEnc`), and TOTP secrets. The fallback string is in a public repo (SC-02), so it is not a secret at all. `.env.example:24-25` labels it "dev only; use a managed KMS in prod". The `jobs` worker in `.do/app.yaml:60-69` gets the var, but any new component, local Docker run with a partial `--env-file`, or a typo in the DO dashboard runs with the public key and never fails.
- **Impact:** A DB read (SQL injection, backup leak, Supabase credential leak, the "shared in chat" password) becomes full plaintext recovery of phone numbers, TOTP seeds and every terminal HMAC secret, i.e. the ability to forge POS transactions for every brand.
- **Fix (effort S):** Add `PII_MASTER_KEY_BASE64: z.string().refine(b64 is 32 bytes)` to `envSchema` and make it required when `NODE_ENV=production`; delete the fallback entirely (tests can set a key). Longer term, per the authors' own note, move to a KMS-wrapped data-key design and add a key-version byte to the ciphertext so rotation is possible.

### SC-04 — Next.js 15.5.19 in all three consoles carries 2 critical / 3 high / 7 moderate advisories
- **Severity:** High. Vendor CVSS for the lead item (GHSA-2xp9-vwfh-vxw4, unauthenticated RCE in the Image Optimization API with AVIF) is Critical; contextual rating High because the apps run on Vercel and the exposure of the self-hosted optimizer path is **Needs verification**.
- **Confidence:** Confirmed versions; exploitability per advisory below.
- **Location:** `pnpm-lock.yaml` resolves `next@15.5.19` for `apps/web-brand`, `apps/web-superadmin`, `apps/docs` (`pnpm ls` output). `next/image` is used in 2 files across the consoles; no `images.remotePatterns`, no `rewrites()` in any `next.config.*`.
- **Evidence (pnpm audit):**

| Advisory | Severity | Title | Fixed in | Applies here? |
|---|---|---|---|---|
| GHSA-2xp9-vwfh-vxw4 | Critical | Unauthenticated RCE in Image Optimization API (AVIF) | ≥15.5.24 | Likely if the Next image optimizer serves `/_next/image` (default); on Vercel the platform optimizer may front it — verify |
| GHSA-p293-qw3h-jr36 / CVE-2026-75604 | Critical | Unauthenticated RCE on Windows-hosted servers | ≥15.5.24 | No (Linux on Vercel) |
| GHSA-m99w-x7hq-7vfj / CVE-2026-64641 | High | DoS in App Router using Server Actions | ≥15.5.21 | Yes (docs portal uses server-side auth route; consoles are client-fetch but App Router) |
| GHSA-89xv-2m56-2m9x / CVE-2026-64649 | High | SSRF in Server Actions on custom servers | ≥15.5.21 | No custom server |
| GHSA-p9j2-gv94-2wf4 / CVE-2026-64645 | High | SSRF in rewrites | ≥15.5.21 | No rewrites configured |
| CVE-2026-64643 | Moderate | Unauthenticated disclosure of internal Server Function endpoints | ≥15.5.21 | Yes |
| CVE-2026-64644/-64646/-64647/-64648 | Moderate | Image SVG DoS, unbounded SA payload, cache confusion ×2 | ≥15.5.21 | Partly |
| CVE-2026-94543 / CVE-2026-94484 | Moderate | SSG/ISR cache poisoning (self-hosted) | ≥15.5.27 | No (Vercel) |

  - Note: CVE-2025-29927 (middleware auth bypass, the one relevant to `apps/docs/middleware.ts`) was fixed in 15.2.3, so 15.5.19 is **not** affected. Positive.
- **Fix (effort S):** Bump `next` to ≥15.5.27 in the three `package.json` files, regenerate the lockfile, redeploy. Add `images.unoptimized = true` or a strict `remotePatterns` list if the optimizer is not needed (the consoles only show brand logos from the API).

### SC-05 — Push-to-main deploys straight to production with no review, no required checks, mutable action tags
- **Severity:** High. CVSS 3.1: `AV:N/AC:H/PR:L/UI:N/S:C/C:H/I:H/A:H` = **8.5** (PR:L = any collaborator account or a compromised one).
- **Confidence:** Confirmed.
- **Location:** `.do/app.yaml:12-15,53-56` (`deploy_on_push: true` for `api` and `jobs`), `apps/*/vercel.json` (Vercel Git integration auto-deploys `main`), `.github/workflows/ci.yml:3-5,38-46`, GitHub settings (SC-02 evidence).
- **Evidence:** No branch protection or ruleset; CI has no deploy step and is not a required check, so a red CI does not stop DO/Vercel from building the pushed commit. `ci.yml` pins `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4` by mutable tag, not commit SHA. No `permissions:` block in the workflow (mitigated: the repo default workflow token permission is `read`, confirmed via API). No SCA, secret-scan, CodeQL or SBOM step. Dependabot alerts and security updates are disabled.
- **Impact:** A single compromised GitHub session or a malicious/compromised third-party action tag ships code to the production API that holds the ledger and PII. Combined with SC-02, the attack surface is "anyone who can get a collaborator's cookie".
- **Fix (effort S/M):** Ruleset on `main` (PR + review + required `build-test` + signed commits + no force-push). Pin actions to full SHAs (Dependabot can keep them updated). Add `permissions: contents: read` explicitly to the workflow. Add `pnpm audit --audit-level=high` (allow-list dev-only paths), gitleaks, and CodeQL jobs. Consider switching DO to `deploy_on_push: false` with a deploy from a CI job that runs after tests, or at minimum rely on the required-check ruleset.

### SC-06 — Unpatched runtime dependencies in the API image
- **Severity:** Medium (highest reachable item is a DoS; the Critical proxy-addr item is not exploitable here). CVSS 3.1 for the reachable `qs` DoS: `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` = **7.5** vendor; contextual Medium given 2 instances and a health check that restarts the container.
- **Confidence:** Confirmed versions; reachability assessed per row.
- **Location:** `apps/api/package.json` direct deps and the transitive set shipped by `pnpm deploy --prod` (`Dockerfile:19`).
- **Evidence (API production graph only):**

| Package @ version | Advisory | Sev | Reachable? | Fixed in |
|---|---|---|---|---|
| proxy-addr 2.0.7 (express) | GHSA-jqcg-44mw-7w3h / CVE-2026-90711 IP spoofing via IPv4-mapped IPv6 trust subnet | Critical | **No** — no `trust proxy` configured anywhere in `apps/api/src`, so trust subnets are never evaluated. (Side effect for 11_perf/03_api: throttler keys on the LB address.) | 2.0.8 |
| qs 6.15.2 (express) | CVE-2026-82562 array-limit bypass; CVE-2026-82417 DoS via `isBuffer` | Moderate ×2 | **Yes** — query strings parsed on every request | 6.16.0 |
| body-parser 2.2.2 | CVE-2026-12590 invalid limit disables size enforcement | Low | Only if a non-numeric limit is configured; `rawBody: true` in `main.ts` uses defaults | 2.3.0 |
| multer 2.1.1 (@nestjs/platform-express) | CVE-2026-5079, -77078, -82333 DoS; CVE-2026-5038; -77063 | High ×3, Mod, Low | **No** — no `FileInterceptor`/`UploadedFile` usage; multer is not on the request path | 2.3.0 |
| sharp 0.35.3 | GHSA-rgj7-g3m4-5g8c (libheif), GHSA-wq5f-xc86-pv6w (librsvg CVE-2026-96889) | High ×2 | **Partly** — `wallet-pass/stamp-strip.ts:76-83` rasterises SVG through librsvg, but the SVG is server-built; brand colour is validated by `HEX6` in `pass-data.ts:36,59-61`, balance/points code are server values. Low practical risk, still patch. | 0.35.5 |
| node-forge 1.4.0 | GHSA-86w9-cpqp-85rv / CVE-2026-85393 PKCS#1 v1.5 verification laxity | High | **No** — forge is used only to *sign* pass manifests (`apple-wallet.service.ts:259-290`); no `verify` calls. No patched release yet. | none |
| js-yaml 4.1.1/4.2.0 (@nestjs/swagger) | CVE-2026-59869, -84375, GHSA-5p4m, CVE-2026-53550 | High ×3, Mod | **No** — only parses the app's own OpenAPI document | 4.3.2 |
| fast-copy 4.0.3 (pino-pretty) | GHSA-jggr-w7fw-pc2j stack exhaustion | Moderate | **No** in prod — transport is disabled when `NODE_ENV=production` (`app.module.ts:63-66`); pino-pretty should be a devDependency | 4.1.0 |

  Other watched packages: express 5.2.1, @nestjs/* 11.1.26, @nestjs/jwt 11.0.2 (jsonwebtoken 9.0.3), otplib 12.0.1, jszip 3.10.1, pdfkit 0.19.1, bullmq 5.78.1, pg 8.21.0, prisma/@prisma/client 6.19.3, class-validator 0.14.4, class-transformer 0.5.1, helmet 8.2.0, pino 9.14.0, @node-rs/argon2 2.0.2, ioredis 5.10.1 — no open advisories in this audit run. `axios`, `twilio`, `resend`, `googleapis`, `passkit-generator` are not dependencies (the app calls Twilio/Resend/Google over `fetch`), which keeps the surface small.
- **Fix (effort S):** `pnpm update express qs sharp @nestjs/swagger` (or `pnpm.overrides` for `qs@>=6.16.0`, `proxy-addr@>=2.0.8`, `body-parser@>=2.3.0`, `js-yaml@>=4.3.2`, `multer@>=2.3.0`); move `pino-pretty` to devDependencies; track node-forge for a fix or migrate pass signing to `@peculiar/x509`/`pkijs`.

### SC-07 — Non-reproducible, unpinned container build; no `.dockerignore`
- **Severity:** Medium. CVSS 3.1: `AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:N` = **6.8** (supply-chain substitution requires upstream compromise).
- **Confidence:** Confirmed.
- **Location:** `Dockerfile:5-7,13,19`; absent `.dockerignore` (confirmed: `cat: .dockerignore: No such file`).
- **Evidence:**
  - `FROM node:22-slim` by floating tag, no `@sha256:` digest; `apt-get install openssl ca-certificates` unpinned.
  - `corepack enable` then `pnpm install`: corepack downloads pnpm at build time. `package.json:6` pins `packageManager: pnpm@10.29.3` **without** the `+sha224.<hash>` integrity suffix, so corepack verifies only the registry signature, not a project-controlled hash. No `COREPACK_INTEGRITY_KEYS` handling; whether the image's corepack carries the post-2025 key set is Needs verification per build.
  - `COPY . .` copies the whole working tree into the `build` stage. On a developer machine this includes `.env`, `.do-token`, `secrets/*` (p12, .p8, pass.key, p12-password.txt), `.claude/settings.local.json` and the keystore. The `runner` stage only copies `/out` and `prisma/sql`, so the final image is clean, but the build-stage layers sit in the local Docker cache and would be exported by `docker save`/`docker push` of the intermediate target. DO App Platform builds from a fresh GitHub clone, so production images are not affected by local secrets (only by SC-01, which is in git).
  - No image signing, no SLSA provenance, no SBOM generation.
- **Fix (effort S):** Add `.dockerignore` (`.env*`, `.do-token`, `secrets/`, `.claude/`, `**/keystore*`, `**/*.apk`, `node_modules`, `.git`, `AUDIT/`). Pin `node:22-slim@sha256:…` and refresh via Dependabot/Renovate. Add the integrity hash to `packageManager` (`corepack use pnpm@10.29.3` writes it). Generate an SBOM (`docker sbom` / syft) and sign with cosign if DO's registry supports it.

### SC-08 — Seed script has no production guard and creates a public-knowledge superadmin
- **Severity:** Medium (High if ever executed against production). CVSS 3.1 (if seeded): `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = **9.8**; contextual Medium because no evidence it ran on prod (Needs verification: query `user_account` for `superadmin@rfm-loyalty.dev` in the production DB).
- **Confidence:** Confirmed (code); production state Needs verification.
- **Location:** `packages/db/prisma/seed.ts:16` (`DEMO_PASSWORD = 'ChangeMe123!'`), `:124` (`superadmin@rfm-loyalty.dev` with `platform_superadmin`), `:151,172` (group/brand admins `admin@<slug>.dev`), `:273` prints the password; no `NODE_ENV` or hostname check anywhere in the file.
- **Evidence:** `docs/deployment.md:14` instructs that the owner `DATABASE_URL`/`DIRECT_URL` is "for migrations/seed" against Supabase; `packages/db/package.json:16,26` exposes `seed`; CI runs it on every push (`ci.yml:90`). `DEPLOYMENT.md:33` says production "does not load demo data", which is only true as long as nobody runs the script.
- **Positive sub-finding:** seeded terminal API keys set only `secretHash` (`seed.ts:209`, `sha256('secret:'+terminal.id)`), never `secretEnc`; `terminal-hmac.guard.ts:65` rejects keys without `secretEnc`, so seeded terminal keys cannot sign requests even if seeded into prod.
- **Fix (effort S):** Refuse to run when `NODE_ENV === 'production'` or when the DB host is not localhost/`embedded` unless `SEED_ALLOW_REMOTE=1`; generate a random password and print it instead of a constant; use a non-routable domain for seeded accounts.

### SC-09 — OTP codes are written to application logs when SMS is unconfigured; phones logged in clear
- **Severity:** Medium. CVSS 3.1: `AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:N/A:N` = **5.3** (requires log access and a misconfigured instance).
- **Confidence:** Confirmed (code). Production has `SMS_PROVIDER=twilio` in `.do/app.yaml:31`, so this is a latent misconfiguration risk rather than a live leak (Needs verification for the `jobs` worker and any staging).
- **Location:** `apps/api/src/auth/otp/sms-sender.service.ts:72-75` (`[OTP NOT SENT — no SMS provider configured] <phone> -> <code>` at `warn`), `:94,169,174,194,199` (phone numbers in warn/error logs), `email.service.ts:39` (recipient e-mail in logs). `.env.example:31` ships `LOG_LEVEL="debug"`.
- **Evidence:** The warning fires whenever `provider === 'none'`, which is the case for any API/worker instance missing one of `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_FROM|MESSAGING_SERVICE_SID` (`sms-sender.service.ts:37-51`). Pino redaction (`app.module.ts:58`) covers only `authorization`, `cookie`, `x-api-key` headers, not message bodies.
- **Impact:** Anyone with DO log access (or a log drain) can take over customer wallets if an instance is misconfigured; phone numbers in logs are PII in a third-party log store regardless.
- **Fix (effort S):** Never log the code; in `production` throw at boot if `SMS_PROVIDER=none`. Mask phone numbers (`+9715…1234`) in all log lines. Default `LOG_LEVEL=info` in `.env.example`.

### SC-10 — Local workstation holds unencrypted signing material and cloud tokens inside the project folder
- **Severity:** Medium (laptop compromise → DO account + Apple pass signing identity). CVSS 3.1: `AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N` = **8.2** local; team risk rated Medium.
- **Confidence:** Confirmed presence; none of these files is git-tracked (`git ls-files` empty for all; `.env` never appeared in history, `git log --all --diff-filter=A` shows only `.env.example`, `.npmrc`, `apps/docs/.env.example`, `apps/mobile/.npmrc` and the keystore).
- **Location (all untracked, all under the repo root):** `.do-token` (71 bytes); `secrets/` containing `pass.key` (unencrypted RSA private key), `pass.p12` + `p12-password.txt` + `p12-base64.txt`, `AuthKey_23V7M4332V.p8` + `apns-key-base64.txt` (APNs auth key; key id visible in the filename), `pass.csr`, `pass.cer`, `wwdr.pem`; `.claude/settings.local.json:96` and `:182` each contain a DigitalOcean API token (`dop_v1_…`) embedded in tool-permission rules. `.env` (894 bytes) contains only localhost/dev values (`DATABASE_URL`→localhost, `JWT_*_SECRET` 28-29 chars dev strings), so it is low-risk.
- **Evidence:** `ls -la` listing above; `git check-ignore` shows `.do-token` (`.gitignore:43`), `secrets/` (`:62`), `.claude/settings.local.json` (ignored by the *global* `~/.config/git/ignore:37`, not by the repo — a teammate without that global rule would commit it). No `.dockerignore` (SC-07) means `docker build .` copies all of them into the build stage.
- **Impact:** Two DO tokens with unknown scope (if they are the same token as `.do-token`, the "one place to rotate" story is wrong; if different, there are three live tokens on disk — Needs verification, not compared during the audit) give App Platform control: env-var read (every production secret), redeploy, log access. The `pass.key`/`.p12` lets anyone mint Apple Wallet passes as the brand's Pass Type ID until the certificate is revoked.
- **Fix (effort S):** Move `secrets/` and tokens out of the repo tree into the OS keychain / 1Password CLI / `gopass`; delete `.claude/settings.local.json` permission rules that embed tokens (use `doctl auth init` or `DIGITALOCEAN_ACCESS_TOKEN` from a keychain instead) and revoke + reissue those tokens; delete `pass.key`, `pass.csr`, `*-base64.txt` once the values are in DO as encrypted env vars; add `.claude/` to the repo `.gitignore` and add the `.dockerignore` from SC-07. Rotate `.do-token`.

### SC-11 — Expo OTA updates are not code-signed; EAS cloud holds store credentials
- **Severity:** Medium. CVSS 3.1: `AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:N` = **6.8** (needs Expo account compromise).
- **Confidence:** Confirmed (config).
- **Location:** `apps/mobile/app.json:57-63` (`runtimeVersion.policy = sdkVersion`, `updates.url = https://u.expo.dev/58eef0fa-…`, no `updates.codeSigningCertificate` / `codeSigningMetadata`); `apps/mobile/eas.json:21-36` (`autoIncrement`, `ascAppId`, submit profiles); owner `following`.
- **Evidence:** `grep codeSigning` across `app.json`/`eas.json` returns nothing. `expo-updates 29.0.19` is installed and enabled in the production channel.
- **Impact:** Whoever controls the Expo account/robot token can publish a JS bundle that every installed customer app will download and run on next launch (tokens in AsyncStorage per 00_system_map §6), with no on-device signature check. Store signing (iOS dist cert, Android upload key, ASC API key, Play service account) all live in Expo's credential store, so that account is a single point of compromise for both stores.
- **Fix (effort M):** Generate an updates code-signing key pair (`npx expo-updates codesigning:generate`), set `updates.codeSigningCertificate` + `codeSigningMetadata` in `app.json`, sign on publish (`eas update --private-key-path`), rebuild binaries. Enforce 2FA + SSO on the Expo org, scope robot tokens, and prefer local credentials (`credentials.json`, already gitignored) for store signing with the keys in a vault.

### SC-12 — Vendored Feitian binaries and toolchain with no provenance or integrity verification
- **Severity:** Medium (payment-adjacent device SDK with no checksum chain). CVSS 3.1: `AV:L/AC:H/PR:H/UI:R/S:C/C:H/I:H/A:H` = **6.6**.
- **Confidence:** Confirmed.
- **Location:** `apps/terminal-android/app/libs/ecr_sdk_1_2_2.aar` (818,365 bytes) and `ftsdk_api_1_0_1_11.jar` (746,069 bytes), committed in c3d32f4, referenced by `app/build.gradle.kts:56-59` via `files(...)`. No `gradle/wrapper/` directory at all; `README.md:12-18` runs Gradle 8.7 from `~/.rfm-android-tools/gradle/gradle-8.7` (downloaded as `~/.rfm-android-tools/dl/{gradle,jdk17,cmdline-tools}.zip`); no setup script and no recorded SHA-256 for any of the three zips. No `gradle/verification-metadata.xml` (dependency verification off). Compose BOM 2024.06.00, OkHttp 4.12.0, kotlinx-coroutines 1.8.1, AGP 8.4.2, Kotlin 1.9.24, ZXing 3.5.3, CameraX 1.3.4 — no known advisories in these versions at audit time, but they are a year old.
- **Evidence:** The ECR AAR is the component that talks to the SmartPay payment app over the terminal's socket; the `ftsdk` jar drives the printer and device services. Neither ships a signature, a vendor checksum, or a licence file in the repo. The build cannot be reproduced by a second engineer without copying an undocumented `~/.rfm-android-tools` directory.
- **Fix (effort S/M):** Record the vendor-supplied SHA-256 of both binaries in `apps/terminal-android/README.md` and verify in a Gradle task; add the Gradle wrapper with `distributionSha256Sum`; enable `gradle --write-verification-metadata sha256` and commit `verification-metadata.xml`; document the toolchain zips with their checksums and source URLs.

### SC-13 — Terminal self-update channel: hash-only integrity, cleartext permitted, superadmin-pushable URL
- **Severity:** Medium (becomes Critical in combination with SC-01). CVSS 3.1: `AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:H` = **8.2** (PR:H = superadmin token).
- **Confidence:** Confirmed.
- **Location:** `apps/api/src/modules/superadmin/superadmin.service.ts:1286-1327` (`createTerminalRelease`), `:1330-1349` (`publishTerminalRelease`); `apps/api/src/modules/terminal-gateway/terminal.service.ts:203-209` (`terminal_current_release`); `apps/terminal-android/app/src/main/java/ae/rfmloyaltyco/terminal/update/AppUpdater.kt:64-97`; `apps/terminal-android/app/src/main/AndroidManifest.xml:34` (`android:usesCleartextTraffic="true"`), confirmed in the shipped v2.6 APK manifest.
- **Evidence:**
  - The APK is **not** stored by the platform. `TerminalRelease.url` (`schema.prisma:564`) is any `https://` URL the superadmin supplies (server regex `^https:\/\/` at `superadmin.service.ts:1295`; client re-checks in `TerminalApi.kt:62`). There is no upload endpoint, no object storage, and no console UI (`grep terminal-releases apps/web-superadmin` is empty), so releases are created by hand with curl.
  - Integrity = SHA-256 published in the same DB row (`AppUpdater.kt:80-93` verifies the download against `release.sha256`). The hash is not signed and the API has no allow-list of download hosts, so a single superadmin JWT (or `elevated` act-as token, or a direct DB write) can point the whole fleet at an attacker-hosted APK with a matching hash.
  - Android then enforces signer continuity, which is the only control that stops an attacker-built APK — and that signer key is public (SC-01).
  - `usesCleartextTraffic="true"` is global; the base URL default is https (`SettingsStore.kt:126`) but pairing can set any `baseUrl` (`SettingsStore.kt:61-63`), and no certificate pinning exists in `TerminalApi.kt`.
  - Positive: downgrade protection (`AppUpdater.kt:71`), `mandatory` flag, draft-until-published, audit log entries for create/publish/unpublish, `allowBackup=false`.
- **Fix (effort M):** After re-keying (SC-01): host APKs on a platform-owned bucket and restrict `url` to that origin; sign the release manifest (versionCode+sha256+url) with an offline Ed25519 key whose public half is baked into the app, and verify it in `AppUpdater`; set `usesCleartextTraffic="false"` with a `network_security_config` that pins the API certificate chain; require a second superadmin approval (the `ChangeRequest` governance model already exists) for `terminal_release.publish`.

### SC-14 — Public documentation discloses operational secrets' context
- **Severity:** Low. CVSS 3.1: `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N` = **5.3**; contextual Low.
- **Confidence:** Confirmed.
- **Location:** `DEPLOYMENT.md:15-18` ("The Supabase DB password was shared in chat, so rotate it first"; rotation Needs verification); `docs/phase-1-status.md:45` (Supabase project ref `uxaozlqxiwwaucrfokuk`, described as unrelated — the memory note about "project-ref ambiguity" is this: `docs/deployment.md` never names the real project, while the status doc names a wrong one); `apps/mobile/eas.json:30` (`ascAppId` 6798199041); `apps/mobile/app.json:57,62` (EAS project id); `secrets/AuthKey_23V7M4332V.p8` filename reveals the APNs key id (local only).
- **Evidence:** Full-history grep for Supabase hostnames, pooler passwords, Twilio `AC…/SK…` SIDs, Resend `re_…`, `dop_v1_…`, JWT `eyJ…`, AWS `AKIA…`, Stripe `sk_live…`, SendGrid `SG.…`, Slack `xox…`, `PRIVATE KEY`, `BEGIN CERTIFICATE`, service-account `"private_key"` across all branches and the (empty) stash found **nothing real**: only `<ref>`/`<password>` placeholders in `DEPLOYMENT.md:28` and `.env.example`, CI's throwaway `postgres:postgres@localhost` and `ci-*-secret-0123456789`, and unit-test `u:p@` URLs. No Apple Team ID appears in the tree.
- **Fix (effort S):** Confirm the Supabase password rotation happened and remove the sentence; delete the stray project ref from the status doc; keep `ascAppId` (it is not secret) but note that the repo being public is what makes the rest matter.

### SC-15 — Lockfile and install-script hygiene gaps (minor)
- **Severity:** Low. CVSS n/a.
- **Confidence:** Confirmed.
- **Location:** `package.json:28-41`, `.npmrc`, `pnpm-lock.yaml:1-9`.
- **Evidence:** `pnpm-lock.yaml` (lockfileVersion 9.0) is committed and `--frozen-lockfile` is used in CI (`ci.yml:48`), Dockerfile (`:13`) and all three `vercel.json` `installCommand`s. No git/URL/tarball dependencies (`resolution: {tarball|repo|commit}` grep is empty), no `patches/`, no `patchedDependencies`. `overrides` = `@types/react: 19.2.17` only. `onlyBuiltDependencies` = `@prisma/client`, `@prisma/engines`, `prisma`, `esbuild`, `@node-rs/argon2`, `@embedded-postgres/{windows-x64,linux-x64,darwin-arm64}`; `sharp` is **not** allowed to run install scripts (fine — 0.33+ uses prebuilt `@img/*` optional packages). `.npmrc` has `auto-install-peers=true`, `strict-peer-dependencies=false`, `enable-pre-post-scripts=true` and no registry/auth lines. `apps/mobile/.npmrc` was added historically but no longer exists.
- **Gaps:** `enable-pre-post-scripts=true` lets any workspace package's own `pre*/post*` scripts run (acceptable, first-party only). `auto-install-peers` silently widens the graph. `embedded-postgres` (17.10.0-beta.17) is a prod dependency of `packages/db` only via scripts; verify it is excluded from `pnpm deploy --prod` (the CI step `verify:prod-deps` guards runtime imports, not image size).
- **Fix (effort S):** Add `pnpm audit --audit-level=high --prod` to CI with an allow-list; consider `minimumReleaseAge` (pnpm 10.16+) to delay brand-new package versions; set `strict-peer-dependencies=true` once peers are clean.

### SC-16 — Licence inventory contains one unknown-licence package and dual GPL-optioned packages
- **Severity:** Low (legal, not security). Confidence: Confirmed via `pnpm licenses list --prod` in `apps/api` (977 packages).
- **Evidence:** `thirty-two@1.0.2` (via `otplib`) reports **Unknown** licence; `node-forge@1.4.0` is `(BSD-3-Clause OR GPL-2.0)` and `jszip@3.10.1` is `(MIT OR GPL-3.0-or-later)` — both are choice licences, choose the permissive branch and record it; `@img/sharp-win32-x64` is `Apache-2.0 AND LGPL-3.0-or-later` (Windows dev only, not in the Linux image); `big-integer`, `stream-buffers` are Unlicense; one `CC-BY-4.0` (`caniuse-lite`-style data). Distribution: MIT 809, ISC 56, Apache-2.0 41, BSD-3 20, BSD-2 20, BlueOak 9, MPL-2.0 2, others ≤3 each. No AGPL/SSPL.
- **Fix (effort S):** Record the licence choice for the two dual-licensed packages in a `THIRD_PARTY_NOTICES.md`; confirm `thirty-two` (it is MIT on npm metadata of later versions, Needs verification).

### SC-17 — No SBOM, provenance, or attestation anywhere in the pipeline (Info)
- No SBOM artefact exists for the API image, the consoles, the mobile app or the terminal APK. Appendix B is a minimal direct-dependency SBOM for `apps/api` produced during this audit. No SLSA provenance, no `npm provenance` checks, no cosign. The Vercel builds and DO builds are not reproducible (SC-07).
- **Fix (effort S):** `syft packages dir:/out -o cyclonedx-json` in the Docker build, upload as a CI artefact; `gradle cyclonedxBom` for the terminal app; `eas build` already exposes a build manifest.

### SC-18 — Build-tool-only advisories (mobile and API dev graph) (Info)
- Everything below is **not shipped** to end users; it affects developer machines and CI runners that parse untrusted input (rarely). Listed so the totals in `pnpm audit` are explainable:
  - `apps/mobile` (Expo CLI / Metro / React Native dev tooling): `shell-quote@1.8.4` (Critical CVE-2026-102422 command injection, High CVE-2026-13311), `brace-expansion@{1.1.15,2.1.1,5.0.6}` (High ×4 + Mod per version), `@xmldom/xmldom@{0.8.13,0.9.10}` (High ×~14 across both), `js-yaml@3.14.2` (High ×3, Mod), `image-size@1.2.1` (High ×2), `undici@6.27.0` (High + Mod ×4 + Low), `postcss@8.4.49` (High ×2, Mod ×2), `browserslist@4.28.2` (High ×2), `compression@1.8.1`, `braces@3.0.3`, `http-cache-semantics@4.2.0`, `decode-uri-component@0.2.2`, `uuid@3.4.0/7.0.3`, `sprintf-js@1.0.3`, `baseline-browser-mapping@2.10.37`.
  - `apps/api` dev graph (`@nestjs/cli`, `vitest`): `tinypool@1.1.1` (Critical ×2, prototype-pollution RCE in `vitest` worker options), `fast-uri@3.1.2` (High ×6, Mod), `brace-expansion@1.1.15/5.0.6`, `js-yaml@4.2.0` via cosmiconfig, `esbuild@0.27.7` (Low), `vitest@3.2.6` + `@vitest/mocker` (Mod CVE-2026-84373 path traversal).
  - `apps/docs` dev graph: `tailwindcss@3.4.19` → `postcss-selector-parser@6.1.4`, `braces@3.0.3`, `nanoid@3.3.12` (High ×2), `source-map-js@1.2.1`, `postcss@8.5.15`.
  - `packages/db`: `deepmerge-ts@7.1.5` via `@prisma/config` (High, CLI only).
- **Fix (effort M):** `pnpm update -r --latest` for `vitest`, `@nestjs/cli`, `expo` SDK patch releases; keep `minimatch`/`brace-expansion` current via overrides; schedule monthly.

### SC-19 — Third-party credential scoping (Info, mostly positive)
- **Twilio:** `sms-sender.service.ts:12-14,46-48,128-151` uses Account SID + **API Key SID/Secret** (Basic auth with `keySid:keySecret`), not the account auth token — the key can be revoked without touching the account. Positive. The `TWILIO_TPL_*` content SIDs and `TWILIO_FROM` are stored as DO secrets though they are not sensitive; harmless.
- **Resend:** `email.service.ts:11,26,46` uses a bearer `RESEND_API_KEY` for `POST /emails` only; whether the key is a "sending access, single domain" key is **Needs verification** in the Resend dashboard.
- **Google Wallet:** `google-wallet.service.ts:16-18,44,175` builds its own RS256 service-account JWT with scope `https://www.googleapis.com/auth/wallet_object.issuer` only. Positive (minimal scope); the private key is read from env and never logged (`:193` logs status only).
- **Apple:** `apple-wallet.service.ts:259-290` loads the Pass Type ID `.p12` + password from env and signs with node-forge; `apns.service.ts:36-60` uses token-based APNs auth (ES256 with `.p8`). Neither is logged. `APPLE_*` variables are not in `.do/app.yaml` and not in `envSchema`; add them to the spec so the deploy is declarative.
- **JWT:** `JWT_ACCESS_SECRET` also signs Apple pass tokens and terminal member tokens (`passkit.service.ts:42`, `apple-wallet.service.ts:213`); one secret, three audiences — covered by 01_appsec, flagged here only because rotating it invalidates all three at once.
- **Logging:** no `logger.debug/log` call interpolates a secret-like variable (grep across `apps/api/src`); the only secret-adjacent log line is the OTP one (SC-09) and the PII-key warning (SC-03).

---

## Not assessed
- Scope/permissions of the DO tokens in `.do-token` and `.claude/settings.local.json`, and whether they are identical (the audit tooling blocked token comparison; left for the user).
- Production environment contents (whether `PII_MASTER_KEY_BASE64`, `APPLE_*`, `GOOGLE_WALLET_*` are set; whether the seed ever ran; whether the Supabase password from `DEPLOYMENT.md` was rotated).
- Vercel project settings (deployment protection, env-var scoping, who can deploy), Expo org membership/2FA, Supabase project access policies, DO team membership.
- Whether the Vercel image optimizer fronts `/_next/image` for these projects (affects SC-04 exploitability).
- Feitian SmartPay OS version (affects SC-01 key-rotation path), and the licence terms for redistributing the Feitian SDK binaries in a public repo.
- The v2.4/v2.6 APK contents beyond string and manifest inspection: no hard-coded API keys, HMAC secrets, debug endpoints or ngrok/LAN hosts were found (only `https://api.partnerspoints.ae/v1/terminal` and the `Loyalty-HMAC publishableKeyId=` scheme), but the DEX was not decompiled.
- Runtime behaviour of `corepack` key verification inside the current `node:22-slim` tag.

## Positive controls verified
- Git history (all 3 branches, `git log --all -p`, 8.4 MB) contains no `.env`, `.do-token`, `secrets/`, `credentials.json`, service-account JSON, `local.properties`, `.vercel/`, APK/AAB or `apps/mobile/dist` files, and no live third-party tokens, JWTs, private keys or connection strings with real passwords. The keystore pair is the only secret ever committed. No stashes.
- `.env` on disk holds only local-dev values; `apps/mobile/dist/` and the four APKs on disk are untracked and ignored.
- `pnpm-lock.yaml` committed; `--frozen-lockfile` everywhere (CI, Dockerfile, 3× `vercel.json`); no git/URL deps; no patches; install scripts restricted to an explicit allow-list; `.npmrc` carries no tokens.
- Repository default `GITHUB_TOKEN` permission is `read` and `can_approve_pull_request_reviews=false`; GitHub secret scanning and push protection are **enabled** (they would not catch a binary keystore or a `.properties` password, but would catch most provider tokens).
- Terminal updater: SHA-256 verification before install, downgrade refusal, https-only enforced on both server and client, draft/publish gating with audit records, `allowBackup=false`, FileProvider-scoped install.
- Terminal HMAC secrets are envelope-encrypted at rest and only decrypted inside the guard; seeded demo keys cannot authenticate.
- Twilio uses an API key (revocable) rather than the account auth token; Google Wallet uses a single least-privilege scope; no third-party SDKs (smaller supply-chain surface).
- Docs portal: `middleware.ts` gate is on Next 15.5.19, past the CVE-2025-29927 fix; security headers set in `next.config.mjs`.
- Pino redacts `authorization`, `cookie`, `x-api-key`; production disables `pino-pretty`.
- Dockerfile is multi-stage; the runtime image contains only `pnpm deploy --prod` output plus SQL, not the source tree.

---

## Appendix A — `pnpm audit` totals (2026-10-10)

| Scope | Critical | High | Moderate | Low |
|---|---|---|---|---|
| Whole workspace (`pnpm audit --json`, 1,539 packages) | 8 | 83 | 45 | 4 |
| API production graph (reachable set from SC-06) | 1 (not exploitable) | 9 | 5 | 2 |
| Next.js consoles (`next@15.5.19`, ×3 apps) | 2 | 3 | 7 | 0 |
| Docs-only prod extras (`sharp@0.34.5`, `postcss`, `nanoid`, `source-map-js`) | 0 | 6 | 2 | 0 |
| Dev/build tooling only (SC-18) | 5 | ~65 | ~31 | 2 |

Raw JSON retained in the session scratchpad (`audit.json`, `audit-api-prod.json`); not committed.

## Appendix B — Minimal SBOM: `apps/api` direct production dependencies

| Package | Version | Licence |
|---|---|---|
| @nestjs/common | 11.1.26 | MIT |
| @nestjs/config | 4.0.4 | MIT |
| @nestjs/core | 11.1.26 | MIT |
| @nestjs/jwt | 11.0.2 | MIT |
| @nestjs/platform-express | 11.1.26 | MIT |
| @nestjs/swagger | 11.4.4 | MIT |
| @nestjs/throttler | 6.5.0 | MIT |
| @node-rs/argon2 | 2.0.2 | MIT |
| @rfm-loyalty/db (workspace) → @prisma/client | 6.19.3 | Apache-2.0 |
| @rfm-loyalty/shared (workspace) → zod | 3.25.76 | MIT |
| bullmq | 5.78.1 | MIT |
| class-transformer | 0.5.1 | MIT |
| class-validator | 0.14.4 | MIT |
| helmet | 8.2.0 | MIT |
| jszip | 3.10.1 | MIT OR GPL-3.0-or-later |
| nestjs-pino | 4.6.1 | MIT |
| node-forge | 1.4.0 | BSD-3-Clause OR GPL-2.0 |
| opentype.js | 2.0.0 | MIT |
| otplib | 12.0.1 | MIT (dep `thirty-two@1.0.2`: Unknown) |
| pdfkit | 0.19.1 | MIT |
| pg | 8.21.0 | MIT |
| pino-http | 10.5.0 | MIT |
| pino-pretty | 13.1.3 | MIT (should be dev) |
| reflect-metadata | 0.2.2 | Apache-2.0 |
| rxjs | 7.8.2 | Apache-2.0 |
| sharp | 0.35.3 | Apache-2.0 |
| zod | 3.25.76 | MIT |

Key transitive runtime components: express 5.2.1 (MIT), body-parser 2.2.2, qs 6.15.2 (BSD-3), proxy-addr 2.0.7, multer 2.1.1, jsonwebtoken 9.0.3, pino 9.14.0, ioredis 5.10.1, undici 6.27.0 (via bullmq/others). Full 977-package licence listing retained in the scratchpad (`licenses.json`).

Other workspaces (direct prod deps): `apps/web-brand` next 15.5.19, react/react-dom 19.2.7, recharts 2.15.4, lucide-react 0.468.0, clsx 2.1.1; `apps/web-superadmin` same + qrcode 1.5.4; `apps/docs` next 15.5.19, react 19.1.0, marked 15.0.12, shiki 3.23.0, lucide-react; `apps/mobile` expo 54.0.36, react-native 0.81.5, expo-router 6.0.24, expo-updates 29.0.19, expo-camera 17.0.10, expo-local-authentication 17.0.8, @react-native-async-storage/async-storage 2.2.0, react-native-reanimated 4.1.7, react-native-svg 15.12.1, react-native-qrcode-svg 6.3.21; `packages/db` @prisma/client 6.19.3, @node-rs/argon2 2.0.2 (+ embedded-postgres 17.10.0-beta.17 for scripts); `apps/terminal-android` Compose BOM 2024.06.00, OkHttp 4.12.0, kotlinx-coroutines 1.8.1, CameraX 1.3.4, ZXing 3.5.3, vendored `ecr_sdk_1_2_2.aar`, `ftsdk_api_1_0_1_11.jar`.

## Appendix C — Rotation checklist (ordered)
1. Repo → private; ruleset on `main`. (SC-02, SC-05)
2. New Android signing key generated offline; `git filter-repo` purge; force-push; GitHub Support purge; fleet re-sign plan (v3 rotation or reinstall). (SC-01)
3. Rotate all terminal HMAC secrets after re-sign. (SC-01/SC-13)
4. Revoke + reissue the DigitalOcean tokens (`.do-token`, both in `.claude/settings.local.json`). (SC-10)
5. Confirm/rotate the Supabase `postgres` and `loyalty_app` passwords. (SC-14)
6. Verify `PII_MASTER_KEY_BASE64` is set on every DO component; if it was ever unset, re-encrypt affected rows under a real key and rotate terminal secrets + force TOTP re-enrolment. (SC-03)
7. Apple: if `secrets/` is considered exposed, revoke the Pass Type ID certificate and the APNs key `23V7M4332V`, reissue, update DO env. (SC-10)
8. Bump `next` ≥15.5.27, `qs`/`express`, `sharp` ≥0.35.5; move `pino-pretty` to dev. (SC-04, SC-06)
9. Add Expo updates code signing and rebuild binaries. (SC-11)
