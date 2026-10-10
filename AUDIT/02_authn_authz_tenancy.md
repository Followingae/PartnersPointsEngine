# 02 — AuthN / AuthZ / Multi-tenancy Audit

Audit date: 2026-10-10. Branch `main` @ afc3fe2 plus uncommitted working tree. Read-only review of source, SQL migrations, consoles, mobile and terminal clients. No production systems were touched. No tests were executed for this report (the e2e suite runs as the DB owner with RLS bypassed, see "Not assessed").

Scope: admin login/MFA, customer OTP, JWT/refresh lifecycle, RBAC map and every `@RequirePermissions`, IDOR/BOLA on every parameterised route, RLS coverage and `TenantService` behaviour, act-as/impersonation, terminal HMAC, PassKit, public receipt, docs portal, diagnostics.

Severity counts: **Critical 1 (conditional)** · **High 4** · **Medium 8** · **Low 13** · **Info 2**.

---

## 1. Findings

### AUTHZ-01 — Seeded demo admin credentials (`ChangeMe123!`, no MFA) and no way to change them
- **Severity:** Critical if the seed was ever run against the production database; otherwise Info. **CVSS 3.1:** AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H = 10.0 (conditional)
- **Confidence:** Needs verification (production DB state is out of scope for this read-only audit)
- **Location:** `packages/db/prisma/seed.ts:16`, `:41`, `:124`, `:151-155`, `:172`; `docs/phase-1-status.md:57`; `apps/api/src/auth/dto/admin-auth.dto.ts:9`
- **Evidence:**
  ```ts
  // seed.ts:16
  const DEMO_PASSWORD = 'ChangeMe123!';
  // seed.ts:124
  const superadmin = await makeUser('superadmin@rfm-loyalty.dev', 'RFM Superadmin');
  await assign(superadmin.id, 'platform_superadmin', 'platform', platform.id, {});
  // seed.ts:151-155  group admins:  admin@<sha256(groupName)[0:6]>.dev  role group_admin
  // seed.ts:172      brand admins:  admin@<slug>.dev                   role brand_admin
  ```
  `docs/phase-1-status.md:57`: "Seeded admin login (all demo users): password `ChangeMe123!`". The login DTO advertises the same password as its Swagger example (`admin-auth.dto.ts:9`). The seed is idempotent and connects via `DIRECT_URL` (`seed.ts:4-5`), the same variable the production API receives (`.do/app.yaml:27`). There is **no** password change, password reset, or forced-rotation endpoint anywhere in the API (route inventory, section 2), so a seeded account keeps this password until someone edits the row by hand. MFA is optional (AUTHZ-03).
- **Impact:** Full platform takeover (superadmin) and, via the seeded `group_admin`, unlimited prepaid-wallet self-funding (AUTHZ-02).
- **Exploit scenario:**
  ```http
  POST /v1/auth/login
  {"email":"superadmin@rfm-loyalty.dev","password":"ChangeMe123!"}
  → 200 {accessToken, refreshToken}   (no MFA step unless someone enrolled)
  ```
- **Fix:** Query prod `user_account` for `email_lower IN ('superadmin@rfm-loyalty.dev') OR email_lower LIKE 'admin@%.dev'`; delete or rotate. Make the seed refuse to run when `NODE_ENV=production` or when the target host is not localhost. Add a password-change endpoint (AUTHZ-08). **Effort:** S

### AUTHZ-02 — `group_admin` can credit its own prepaid wallet and zero its own cost rule
- **Severity:** High. **CVSS 3.1:** AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N = 6.5
- **Confidence:** Confirmed (static); exploitability requires a `group_admin` account, which the seed creates and which cannot be created through any API invite path
- **Location:** `apps/api/src/auth/authz/authz.service.ts:22`; `apps/api/src/modules/superadmin/superadmin.controller.ts:274-287`; `apps/api/src/modules/superadmin/superadmin.service.ts:1206-1232`; `apps/api/src/auth/guards/admin-jwt.guard.ts:33`
- **Evidence:**
  ```ts
  // authz.service.ts:22
  group_admin: ['group.manage', 'group.wallet.manage', 'brand.manage', 'brand.report.read'],
  // superadmin.controller.ts:274-281
  @Post('groups/:groupId/wallet/topup') @RequirePermissions('group.wallet.manage')
  @Post('groups/:groupId/cost-rule')    @RequirePermissions('group.wallet.manage')
  // superadmin.service.ts:1206-1214  topUpWallet → this.wallet.topUp(ctx, { scope:{groupId}, amountMinor, ... })
  // superadmin.service.ts:1216-1231  setCostRule → tx.costRule.create({ groupId, costPerPointMinor: BigInt(dto.costPerPointMinor), ... })
  ```
  `AdminJwtGuard` admits both `superadmin` and `brand_admin` surfaces; a group-scoped login gets surface `brand_admin` with roles `['group_admin']` (`auth.service.ts:306-316`). `PermissionsGuard` only checks role → permission. Under RLS the group GUC is set to the caller's own group (`tenant.service.ts:39-41`), so the `WITH CHECK` on `ledger_account`/`journal`/`cost_rule` confines the write to the caller's **own** group — which is exactly the group whose wallet funds its brands' redemptions. Nothing requires an external payment reference; the amount is attacker-chosen (`TopUpDto`).
- **Impact:** A merchant admin mints unlimited prepaid credit the platform is supposed to be paid for, and can set `costPerPointMinor = 0` so settlement (`SettlementService`) draws down nothing.
- **Exploit scenario (as a group admin):**
  ```http
  POST /v1/admin/groups/<myGroupId>/wallet/topup
  Authorization: Bearer <group_admin token>
  {"amountMinor": 100000000, "currency": "AED", "idempotencyKey": "x1"}
  POST /v1/admin/groups/<myGroupId>/cost-rule
  {"costPerPointMinor": 0}
  ```
- **Fix:** Remove `group.wallet.manage` from `group_admin` (keep read-only wallet views), or split into `group.wallet.read` vs `platform.wallet.fund`; additionally assert `ctx.scopeLevel === 'platform'` inside `topUpWallet`/`setCostRule`. **Effort:** S

### AUTHZ-03 — MFA is optional for every admin (including superadmin), and `POST /auth/mfa/enrol` silently disables an enrolled factor
- **Severity:** High. **CVSS 3.1:** AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N = 8.1
- **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/auth.service.ts:51-57`, `:69-77`; `apps/api/src/auth/controllers/admin-auth.controller.ts:49-54`
- **Evidence:**
  ```ts
  // auth.service.ts:55  MFA only if the user chose to enrol
  if (user.totpEnabled) return { mfaRequired: true };
  return this.issueAdminTokens(user.id);
  // auth.service.ts:72-75  enrol overwrites the secret AND flips totpEnabled to false,
  // with no password or current-code check
  await this.db.userAccount.update({ where: { id: userId },
    data: { totpSecretEnc: this.crypto.encrypt(secret), totpEnabled: false } });
  ```
  `enrol` is guarded only by `AdminJwtGuard` (`admin-auth.controller.ts:50`), i.e. any valid 15-minute access token. There is no "MFA required for platform roles" check anywhere; `platformTeam()` merely reports `totp_enabled` (`superadmin.service.ts:1179`).
- **Impact:** (a) The platform control plane is protected by password only unless each admin opts in. (b) Anyone holding a short-lived access token (XSS on the console — tokens live in `localStorage`, stolen laptop, leaked log) downgrades the account to password-only permanently, then logs in later with the password alone.
- **Exploit scenario:**
  ```http
  POST /v1/auth/mfa/enrol        Authorization: Bearer <stolen 15-min token>
  → 200 {secret, keyUri}          (victim's TOTP now disabled)
  POST /v1/auth/login  {"email":victim,"password":known}
  → 200 tokens, no mfaRequired
  ```
- **Fix:** Require the current TOTP code (or password re-entry) before re-enrolling; never set `totpEnabled=false` on enrol — store the pending secret in a separate column until `confirm`. Enforce `totpEnabled` for `platform_*` and `group_admin` roles at login and at `issueAdminTokens`. **Effort:** S–M

### AUTHZ-04 — Rate limiting keys on the load-balancer address (no `trust proxy`), so login/OTP limits are global and trivially DoS-able
- **Severity:** High. **CVSS 3.1:** AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H = 7.5
- **Confidence:** Needs verification (depends on DO App Platform placing a proxy in front of the container, which its routing layer does)
- **Location:** `apps/api/src/main.ts` (no `app.set('trust proxy', …)`), `apps/api/src/app.module.ts:41-43,93`; `apps/api/src/auth/device.ts:23`
- **Evidence:** `grep -rn "trust proxy" apps/api/src` → no matches. `@nestjs/throttler@6.5.0` tracks by `req.ips[0] ?? req.ip`; without `trust proxy`, Express ignores `X-Forwarded-For` and `req.ip` is the socket peer (the platform router). All clients therefore share one bucket: `/v1/auth/login` 10/min, `/v1/auth/mfa` 10/min, `/v1/customer/auth/otp` 5/min, `/v1/customer/auth/verify` 10/min, everything else 300/min. `deviceOf()` also records the router IP for every wallet session.
- **Impact:** Six OTP requests per minute from anyone lock **every** customer out of sign-in; eleven login attempts lock every admin out. Conversely, the per-attacker limit the comments rely on ("ten a minute makes brute force take years") does not exist as a per-attacker control.
- **Exploit scenario:** `for i in 1..6: POST /v1/customer/auth/otp {"phone":"+971500000000"}` every minute → all other customers receive 429.
- **Fix:** `app.set('trust proxy', 1)` (or the DO-specific hop count) in `main.ts`; move throttling to a shared store (Redis/Valkey is already provisioned) and add per-account keys for login/MFA/OTP. **Effort:** S

### AUTHZ-05 — Background jobs enumerate brands/groups through the RLS-enforced client with no tenant context, so settlement, point expiry, transaction alerts and webhooks never run in production
- **Severity:** High (integrity of money flows; no attacker needed). **CVSS 3.1:** AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N = 7.5 (nominal)
- **Confidence:** Confirmed (static); Likely at runtime whenever `APP_DATABASE_URL` is set, which `.do/app.yaml:28` does
- **Location:** `apps/api/src/modules/workers/worker-runner.service.ts:4`, `:92-96`, `:106-110`; `packages/db/prisma/sql/rls.sql:160-173`, `:147-158`
- **Evidence:**
  ```ts
  // worker-runner.service.ts:92  (PrismaService = APP_DATABASE_URL = loyalty_app)
  const brands = await this.prisma.brand.findMany({ where: { status: 'active' }, ... });
  // worker-runner.service.ts:106
  const groups = await this.prisma.group.findMany({ where: { status: 'active' }, ... });
  ```
  `brand`/`tenant_group` policies require a brand, group or platform GUC (`rls.sql:163-167`); none is set outside `TenantService.run`, so both queries return zero rows and every `perBrand`/`perGroup` job is a no-op. Only `account-deletions` (definer function) and `txn-alerts` claim (definer) still work.
- **Impact:** Merchants are never settled (`drawdownWallet` never posts), points never expire (liability overstated, breakage never recognised), webhooks never deliver. Local dev (owner role) hides this entirely.
- **Fix:** Enumerate tenants through a `SECURITY DEFINER` function (`active_brands()`), or run the enumeration under a synthesized platform context via `TenantService.run`. Add an e2e test that runs the runner as `loyalty_app`. **Effort:** S

### AUTHZ-06 — Refresh-token lifecycle: no user-status re-check, no reuse detection, no "revoke all", 30-day rolling sessions
- **Severity:** Medium. **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N = 7.4 (token theft precondition)
- **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/auth.service.ts:88-102`, `:181-226`, `:295-329`, `:104-110`
- **Evidence:**
  ```ts
  // refresh(): verifies JWT, finds row, revokes it, then issueAdminTokens(payload.sub, tokenHash)
  // issueAdminTokens re-reads role assignments but NEVER reads user.status (:296-300)
  // Reuse of an already-revoked token → 401 only; the replacement chain (replacedBy) is never walked/invalidated (:97-101, :192-194)
  // logout(): revokes exactly one token (:104-110); no endpoint revokes all admin sessions
  ```
  `findActiveAdmin` checks `status === 'active'` only at login (`:285-289`). `storeRefresh` uses `JWT_REFRESH_TTL_SECONDS` (30 d) on every rotation, so a session is renewed indefinitely.
- **Impact:** A user marked `suspended`/`archived` in the DB (there is no API to do so — see AUTHZ-22) keeps refreshing forever; a stolen refresh token used before the victim's device is not detected; compromised admins cannot be force-logged-out short of deleting all their role assignments.
- **Exploit scenario:** Attacker exfiltrates `rfm_sa_token`'s sibling refresh token (mobile `AsyncStorage`, console memory); calls `POST /v1/auth/token` every <15 min. Victim's own later refresh fails with 401 and looks like "session expired".
- **Fix:** On refresh re-check `status`; on reuse of a revoked token revoke the whole family (`replacedBy` chain); add `POST /auth/logout-all` (`revokedAt` for all rows of `userId`/`personId`); cap absolute session age (e.g. 90 d from `firstSeenAt`); add `@Throttle` to `/auth/token` and `/customer/auth/refresh`. **Effort:** M

### AUTHZ-07 — `analyst_readonly` holds `platform.report.read`, which unlocks decrypted customer phone/email via superadmin endpoints the role is not meant to have
- **Severity:** Medium. **CVSS 3.1:** AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N = 6.5
- **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/authz/authz.service.ts:25`; `apps/api/src/modules/superadmin/superadmin.controller.ts:179-191`; `apps/api/src/modules/superadmin/superadmin.service.ts:457-520`, `:523-710`, `:712-719`; `apps/api/src/modules/team/team.service.ts:9`
- **Evidence:**
  ```ts
  analyst_readonly: ['brand.report.read', 'platform.report.read'],       // authz.service.ts:25
  @Get('customers')          @RequirePermissions('platform.report.read')   // superadmin.controller.ts:179
  @Get('customers/:personId') @RequirePermissions('platform.report.read') // :186
  phone: this.revealPhone(p.phoneEnc), email: this.revealPhone(p.emailEnc) // service :511, :637-638
  ```
  A brand admin can invite an `analyst_readonly` (`team.service.ts:9`). That analyst lacks `brand.customer.read` (so `/v1/manage/customers/:id/profile` is 403) but passes `platform.report.read` on `/v1/admin/customers*`. Under RLS the person policy (`rls.sql:244-266`) exposes every person who is a member of the analyst's brand, with phone and email decrypted server-side. The same permission also opens `/v1/admin/audit-logs`, `/v1/admin/vouchers`, `/v1/admin/search`, `/v1/admin/receipt-stats`, `/v1/admin/change-requests` to the analyst (brand-filtered by RLS, platform-wide in local dev).
- **Impact:** A "read-only analyst" exports the brand's full customer contact list, defeating the intent of `brand.customer.read`.
- **Exploit scenario:** `GET /v1/admin/customers?limit=200&offset=0` with an analyst token → rows with `phone` in clear.
- **Fix:** Drop `platform.report.read` from `analyst_readonly` (give platform analysts a separate platform-scoped assignment); make the `/v1/admin/*` controllers additionally require `ctx.scopeLevel === 'platform'` (a `@PlatformOnly()` guard); never decrypt PII for a role without `brand.customer.read`. **Effort:** S

### AUTHZ-08 — Invites return the temporary password to the inviter, and there is no password change/reset endpoint
- **Severity:** Medium. **CVSS 3.1:** AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N = 8.1 (insider)
- **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/team/team.service.ts:10`, `:57-61`, `:75`; `apps/api/src/modules/superadmin/superadmin.service.ts:77-87`; route inventory (no `password` route in any controller)
- **Evidence:**
  ```ts
  return { userId, email, roleKey, tempPassword: tempPw };   // team.service.ts:75, superadmin.service.ts:87
  ```
  `tempPw` is `Tmp-` + 12 random bytes (fine entropy) but it is the account's permanent password: no `/auth/password`, `/auth/reset` or forced-change flag exists; `UserAccount` has no `mustChangePassword`. Invites to an **existing** email silently attach a new role (`team.service.ts:64-72`) and return `tempPassword: null`, which also tells the inviter whether that email already has a platform account (cross-tenant enumeration).
- **Impact:** Every brand admin permanently knows the password of everyone they invited (including other `brand_admin`s) and can act as them; audit attribution is meaningless; password hygiene cannot be enforced.
- **Fix:** Replace the temp password with a single-use, expiring invite token delivered by email (Resend is already wired), add `POST /auth/password` (requires current password + MFA) and `POST /auth/reset`; add `mustChangePassword`. **Effort:** M

### AUTHZ-09 — Elevated act-as token travels in a URL query string; `/act` accepts any token
- **Severity:** Medium. **CVSS 3.1:** AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N = 6.8
- **Confidence:** Confirmed
- **Location:** `apps/web-superadmin/lib/api.ts:405-409`; `apps/web-brand/app/act/page.tsx:10-18`; `apps/api/src/modules/superadmin/superadmin.service.ts:124-140`
- **Evidence:**
  ```ts
  window.open(`${BRAND_CONSOLE_URL}/act?token=${encodeURIComponent(token)}`, '_blank', 'noopener'); // superadmin api.ts:409
  const token = new URLSearchParams(window.location.search).get('token'); if (token) { setToken(token); ... } // act/page.tsx:11-13
  ```
  The token is a 15-minute brand token with `elevated: true` (bypasses governance, `governance.interceptor.ts:34`) and `roles: ['brand_admin']`. It lands in browser history, Vercel request logs and any `Referer` emitted by the first page load. The `/act` page performs no origin or state check, so a link `platform.partnerspoints.ae/act?token=<attacker-brand-token>` silently logs a victim into an attacker-controlled brand (login CSRF).
- **Fix:** Pass the token in the URL fragment (`#token=`) or via `postMessage` from the opener with origin check; have `/act` verify `document.referrer`/opener origin and show the brand name before storing. **Effort:** S

### AUTHZ-10 — Suspending a terminal, branch or merchant group does not stop its HMAC key from transacting
- **Severity:** Medium. **CVSS 3.1:** AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N = 6.5
- **Confidence:** Likely (static; no runtime test)
- **Location:** `apps/api/src/auth/guards/terminal-hmac.guard.ts:61-66`, `:80-88`; `apps/api/src/modules/superadmin/superadmin.service.ts:267-276` (`setGroupStatus`), `:370-378` (`setBranchStatus`), `:969-977` (`setTerminalStatus`)
- **Evidence:**
  ```ts
  const key = await this.authDb.apiKey.findUnique({ where: { publishableId } });
  if (!key || key.status === 'revoked') throw new UnauthorizedException(...);   // only the key's own status
  ```
  `setTerminalStatus`/`setBranchStatus`/`setGroupStatus` update the entity row only; none revokes `api_key` rows (`revokeTerminalKeys` is a separate call). `TerminalService` never reads `terminal.status`, `branch.status`, `brand.status` or `group.status` on the earn/redeem paths (`terminal.service.ts:126-141`, `:596-854`).
- **Impact:** A console operator who "suspends" a compromised till, a closed branch or a non-paying merchant believes transactions have stopped; the device keeps earning/redeeming points against the merchant wallet.
- **Fix:** In the guard, join `terminal`/`branch`/`brand`/`tenant_group` status (one query) and reject non-active; have the status setters revoke active keys. **Effort:** S

### AUTHZ-11 — A customer whose account deletion completed can still sign in; refresh tokens and pass tokens survive deletion
- **Severity:** Medium. **CVSS 3.1:** AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N = 5.4
- **Confidence:** Confirmed (static)
- **Location:** `packages/db/prisma/sql/2026-08-05_account_deletion.sql:106-121`; `packages/db/prisma/sql/2026-07-28_customer_wallet.sql:182-199`; `apps/api/src/auth/auth.service.ts:144-148`, `:181-194`
- **Evidence:** The sweep nulls name/phone_enc/email_enc/birthdate/nationality and sets `status='archived'` but leaves `phone_hash` (`:106-113`) and does not touch `refresh_token`. `wallet_person_by_phone` matches on `phone_hash` with no status filter (`:198`), and `verifyOtpForWallet` only checks `if (!person)` (`:148`). `refreshWallet` checks the row, not the person (`:192`). Apple pass auth tokens are derived from the serial (`passkit.service.ts:41-44`) and remain valid.
- **Impact:** "Deleted" accounts remain signable-in (regulatory: PDPL/GDPR erasure claims are inaccurate); a stolen refresh token outlives the deletion the victim performed to contain it.
- **Fix:** Sweep should null `phone_hash`/`email_hash` (or move to a tombstone table), revoke all `refresh_token` rows for the person, and delete `pass_registration` rows for their memberships; `verifyOtpForWallet`/`refreshWallet` should reject `status <> 'active'`. **Effort:** S

### AUTHZ-12 — `terminal_release` RLS policy reads a GUC the app never sets (`app.current_platform` vs `app.current_platform_id`) and is `FORCE`d
- **Severity:** Medium (fail-closed functional break of OTA release management; shows the RLS layer is untested in prod shape). **CVSS 3.1:** AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:N/A:L = 2.7
- **Confidence:** Confirmed (static)
- **Location:** `packages/db/prisma/sql/2026-08-03_terminal_releases.sql:51-57`; `packages/shared/src/scope.ts:44-51`; `apps/api/src/platform-core/tenancy/tenant.service.ts:35-38`
- **Evidence:**
  ```sql
  ALTER TABLE terminal_release FORCE ROW LEVEL SECURITY;
  CREATE POLICY terminal_release_platform ON terminal_release
    USING (platform_id = current_setting('app.current_platform', true)) ...
  ```
  `RLS_SETTINGS.platform = 'app.current_platform_id'`; `grep "app.current_platform'"` finds only this file. The policy also has no `TO loyalty_app`, so with `FORCE` it binds the table owner as well; `terminal_current_release()` (definer) therefore also returns nothing unless the owner role has `BYPASSRLS`.
- **Impact:** `GET/POST /v1/admin/terminal-releases*` return empty/`new row violates row-level security policy` in production; terminals never receive OTA builds (including security fixes). Local dev (owner, no FORCE on other tables) hides it.
- **Fix:** Rewrite the policy to `nullif(current_setting('app.current_platform_id', true),'')` with `TO loyalty_app`, drop `FORCE`, and add this table to the `rls.test.ts` matrix. **Effort:** S

### AUTHZ-13 — Brand-scoped team management cannot work under RLS (`user_account` is platform-only), inviting an unsafe "fix"
- **Severity:** Medium (functional break + risk that the policy gets loosened). **CVSS 3.1:** N/A (defect)
- **Confidence:** Likely (static)
- **Location:** `packages/db/prisma/sql/rls.sql:181-196`; `apps/api/src/modules/team/team.service.ts:21-27`, `:56-63`
- **Evidence:** `user_account` and `refresh_token` policies are `platform_id = app.current_platform_id` only (`rls.sql:184-188`). A brand principal sets only `app.current_brand_id` (`tenant.service.ts:42-44`). `team.list` includes the required `user` relation (`:23-25`) → no `user_account` rows are visible → Prisma raises on a required relation; `team.invite` does `userAccount.findFirst` (always null) then `userAccount.create` (`:58-63`) → `WITH CHECK` fails. The e2e tests pass because they run as the owner (see "Not assessed").
- **Impact:** Brand admins cannot list, invite or change their team in production; the likely quick fix (adding a brand clause to `user_account` or using `AuthPrismaService`) would expose all staff accounts cross-tenant. Do **not** do that.
- **Fix:** Expose brand team operations through narrow `SECURITY DEFINER` functions (`brand_team_list(brand_id)`, `brand_team_invite(...)`) that join through `role_assignment.brand_id`, mirroring the `wallet_*` pattern. **Effort:** M

### AUTHZ-14 — Admin login leaks account existence through timing (argon2 skipped for unknown/non-active emails)
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N = 5.3
- **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/auth.service.ts:51-57`, `:285-289`
- **Evidence:** `findActiveAdmin` throws before `passwords.verify` runs; a known email costs one Argon2id verification (tens of ms), an unknown one returns in ~1 ms. Same message, different latency. `@node-rs/argon2` `hash()` is called with library defaults (`password.service.ts:8`; m=19 MiB, t=2, p=1 — acceptable, but unpinned).
- **Fix:** Always run `verify` against a static dummy hash when the user is missing; pin Argon2id parameters explicitly. **Effort:** S

### AUTHZ-15 — `POST /customer/auth/wallet` has no dedicated throttle; attackers can burn a victim's 5 OTP attempts, and re-issue resets the counter
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L = 5.3
- **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/controllers/customer-auth.controller.ts:45-50` (no `@Throttle`, so 300/min default); `packages/db/prisma/sql/2026-07-28_otp_code.sql:41-45`, `:69-81`
- **Evidence:** Code entropy (6 digits, `randomInt`) and `MAX_ATTEMPTS=5` per code are sound and enforced in SQL under `FOR UPDATE`. But anyone who knows a victim's phone can POST five wrong codes to `/customer/auth/wallet` (no per-IP tightening) and the victim's freshly received code is dead; `otp_issue` resets `attempts = 0` on every re-send (`:44`), so the attacker gets 25 guesses per 15-minute window per number (5 sends × 5 attempts) rather than 5. Resend abuse against a victim number is capped at 5 SMS/15 min (acceptable).
- **Fix:** `@Throttle({limit:10})` on `wallet`, keep the attempt counter across re-issues within the window, and add a per-phone verify limiter. **Effort:** S

### AUTHZ-16 — TOTP step: no account lockout, no backup codes, step not bound to the password check, 6-digit window brute-forceable across instances
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N = 7.4 (requires the password)
- **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/auth.service.ts:59-67`; `apps/api/src/auth/controllers/admin-auth.controller.ts:28-34`; `apps/api/src/auth/totp/totp.service.ts:20-26`
- **Evidence:** `/auth/mfa` re-takes email+password+code; the only limiter is the (globally keyed, AUTHZ-04) 10/min/IP throttle across two instances, with no per-account failure counter and no replay check on a used code (otplib v12 default window 0, but a code can be re-submitted within its 30 s). No recovery/backup codes exist, so a lost authenticator means a DB edit. The password is transmitted twice (login and mfa), widening exposure.
- **Fix:** Issue a short-lived `mfa_step` token from `/login` and accept only that on `/mfa`; per-account lockout after N failures; remember the last accepted TOTP counter; add hashed backup codes. **Effort:** M

### AUTHZ-17 — HMAC nonce store is per-instance; a captured request can be replayed once per other replica inside the 300 s skew
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N = 4.8
- **Confidence:** Confirmed (code) — practical only with a TLS break or a malicious on-path proxy
- **Location:** `apps/api/src/auth/nonce-store.service.ts:10-18`; `apps/api/src/auth/guards/terminal-hmac.guard.ts:74-78`; `.do/app.yaml` (2× basic-xs)
- **Evidence:** `Map` in process memory; TODO at `:78`. Canonical string excludes the query string (`terminal-hmac.guard.ts:67`) and all headers. Idempotency keys make earn/capture/void replays harmless, but `POST /terminal/members/resolve` replayed yields a fresh 10-minute member token and `GET /terminal/transactions/:id` discloses state.
- **Fix:** Move nonces to Valkey (`SET NX EX`), which is already provisioned (`REDIS_URL`); include the query string in the canonical form; add `Loyalty-Version` to the signed string if it ever changes behaviour. **Effort:** S

### AUTHZ-18 — Terminal member tokens carry no `typ`; any JWT signed with `JWT_ACCESS_SECRET` for the same brand passes `member()`
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N = 4.2
- **Confidence:** Confirmed (static)
- **Location:** `apps/api/src/auth/tokens/token.service.ts:73-84`; `apps/api/src/modules/terminal-gateway/terminal.service.ts:114-123`
- **Evidence:** `member()` verifies signature and `claims.brandId === ctx.brandId` only. A customer **access** token (`sub, brandId, groupId, platformId`, no `membershipId`) satisfies both; downstream `membershipId` is `undefined`, and Prisma treats `undefined` in `where` as "no filter" (`loyalty.service.ts:findLiabilityAccount`), so `members/context` would return the first points account of the brand. Requires a terminal key holder to present a customer token, so impact is contained, but it is a type-confusion hole in a shared-secret design. Access tokens cannot be used as pass links (`typ` checked at `wallet-pass.service.ts:93`) and member/pass tokens are rejected by all three JWT guards (`surface` missing) — those directions are fine.
- **Fix:** Add `typ: 'member'` and check it; validate `claims.membershipId` is a non-empty string. **Effort:** S

### AUTHZ-19 — One symmetric secret for four token kinds; no `iss`/`aud`; verification algorithms unpinned
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:N = 8.2 (only if the secret leaks)
- **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/tokens/token.service.ts:46-109`; `apps/api/src/modules/wallet-pass/passkit.service.ts:41-44`; `apps/api/src/modules/wallet-pass/apple-wallet.service.ts:212-215`; `apps/api/src/config/env.ts:17-18`
- **Evidence:** `JWT_ACCESS_SECRET` signs admin/customer/wallet access tokens, terminal member tokens, Apple pass-link tokens, **and** is the HMAC key for every Apple pass authentication token (a value embedded in every `.pkpass` shipped to customers' phones). Minimum length is 16 chars (`z.string().min(16)`), which permits a 128-bit-ish human-typed string. `verifyAsync` passes only `secret`, so HS256/384/512 are all accepted (no `none`, no RS confusion — a true positive). No `iss`/`aud`/`typ` on access tokens; guards discriminate by the `surface` claim only.
- **Fix:** Separate secrets per token family (or HKDF-derive with a label); set `algorithms: ['HS256']`, `issuer`, `audience`; raise minimum to 32 bytes and require base64. **Effort:** S

### AUTHZ-20 — Tables outside RLS that `loyalty_app` can read/write directly: `receipt`, `push_token`, `account_deletion`, `pass_registration`, `pass_state` (plus `rbac_*`, `impersonation_session` by design)
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N = 3.1
- **Confidence:** Confirmed (static)
- **Location:** `packages/db/prisma/sql/rls.sql:88-101`, `:219-221`; `2026-07-28_person_access_and_receipts.sql:103-106`; `2026-08-04_push_tokens.sql:43`; `2026-08-05_account_deletion.sql:142`; `2026-08-06_pass_registrations.sql:121-122`
- **Evidence:** Each of these grants `SELECT/INSERT/UPDATE/DELETE` to `loyalty_app` with no `ENABLE ROW LEVEL SECURITY` (contrast `otp_code`, which enables RLS with no policy = deny-all, and still works through definer functions). `receipt` carries member names, masked PAN, auth numbers and balances for every brand; `terminal.service.ts:299` looks it up by token without a brand clause, so a terminal of brand A can probe whether a token exists for brand B. Current application code reaches these tables only via by-token lookups and definer functions, so there is no live cross-tenant read today.
- **Fix:** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` with no policy for `loyalty_app` on all five (owner-executed definer functions keep working); add `brandId` to the receipt idempotency lookup. **Effort:** S

### AUTHZ-21 — PassKit web service: unauthenticated serial listing, non-rotating per-pass secret, pass data reachable by serial alone
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N = 3.7
- **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/wallet-pass/passkit-web.controller.ts:79-89`, `:104-120`; `passkit.service.ts:41-52`, `:111-136`; `2026-08-06_wallet_pass_data.sql:29-33`
- **Evidence:** `GET /v1/devices/:deviceLibraryId/registrations/:passTypeId` has no auth (Apple's spec) and returns membership ids for any guessed device id (device ids are opaque, so enumeration is impractical). `verifyPassAuth` is constant-time and correct, but the token is `HMAC(JWT_ACCESS_SECRET, "pass:"+membershipId)`: it never rotates, survives membership archival and account deletion (AUTHZ-11), and inherits AUTHZ-19. `latestPass` builds pass data with `p_person_id = NULL` (ownership check skipped by design, `wallet_pass_data.sql:33`).
- **Fix:** Derive pass tokens from a dedicated key with a per-membership random salt stored in `pass_state`, so revocation is possible; reject archived memberships in `wallet_pass_data`. **Effort:** M

### AUTHZ-22 — Role map inconsistencies: `brand_manager` grants nothing, `platform_support` holds `brand.manage`/`group.manage` without `platform.manage`, no API can suspend a staff account
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:L/PR:H/UI:N/S:U/C:L/I:L/A:N = 3.8
- **Confidence:** Confirmed
- **Location:** `apps/api/src/auth/authz/authz.service.ts:9-26`; `packages/shared/src/enums.ts:63-71`; `superadmin.service.ts:18`, `:1010-1039`; `team.service.ts:9`
- **Evidence:** `brand_manager` exists in `RoleKey` and the seeded `rbac_role` table but has no entry in `ROLE_PERMISSIONS` — a user assigned it can log in and reach every `AdminJwtGuard`-only route (`/v1/auth/mfa/enrol`, `/v1/admin/diagnostics/whoami`) but nothing else; neither invite path offers it. `platform_support` can mutate any brand's programme via `/v1/manage/*` (`brand.manage`, `brand.campaign.write` is absent though) and any group (`group.manage` is unused by any route). `UserAccount.status` is only ever read; there is no route to suspend or delete a staff login (revoke only deletes role assignments, which does stop refresh — a positive). The DB-stored `rbac_role_permission` table is seeded but never consulted; the TypeScript map is the single source of truth, so the superadmin "Roles" screen (`rolesCatalog`) is cosmetic.
- **Fix:** Either implement `brand_manager` (e.g. `brand.campaign.write` + `brand.customer.read`) or remove it from the enum and seed; narrow `platform_support`; add `PATCH /admin/team/:userId/status`. **Effort:** S

### AUTHZ-23 — Impersonation sessions never end and audit rows do not record that a write was `elevated`
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:L/A:N = 2.7
- **Confidence:** Confirmed
- **Location:** `superadmin.service.ts:116-141`; `apps/api/src/platform-core/audit/audit.service.ts:30-42`; `packages/db/prisma/schema.prisma:442-454`
- **Evidence:** `actAsBrand` writes an `impersonation_session` row with a fixed reason and no `expiresAt`/`endedAt`; issues a 15-minute token with **no refresh token** (good: it cannot be extended — verified `issueAccess` only, `:124-139`). `AuditService.record` stores `actorId = onBehalfOf ?? actor.id` (both are the superadmin's id) and does not persist `elevated`, so a governance-bypassing write by a superadmin is indistinguishable in `audit_log.data` from an ordinary brand write except by cross-referencing the actor id against `user_account`. The audit hash chain is computed from the last row *visible to the caller's RLS scope* (`:27`), so chains are per-scope and racy under concurrency — verification tooling does not exist.
- **Fix:** Record `elevated` and `impersonationSessionId` in audit `data`; set `expiresAt` on the session and refuse `/act` tokens after it; compute the chain under an advisory lock with a platform-wide previous hash. **Effort:** M

### AUTHZ-24 — Brand invites attach roles to any existing platform account by email and reveal whether the email exists
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N = 5.4 (local-dev/owner-role shape; fail-closed in prod per AUTHZ-13)
- **Confidence:** Confirmed
- **Location:** `team.service.ts:56-75`; `superadmin.service.ts:74-87`
- **Evidence:** `tempPassword: null` in the response means "this email already had an account somewhere on the platform". A brand admin can bind a `brand_admin` role to a superadmin's or another brand's account without that person's consent (they will then see the inviting brand in their console). `InviteMemberDto.email` is only `@IsString()` (`team/dto.ts:5-8`); the regex check in the service is permissive.
- **Fix:** Invite-token flow (AUTHZ-08) with acceptance by the invitee; uniform response. **Effort:** M (covered by AUTHZ-08)

### AUTHZ-25 — CORS reflects any origin with `credentials: true` when `CORS_ORIGINS` is unset, and it is not set in the DO spec
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N = 3.1
- **Confidence:** Likely (`.do/app.yaml` has no `CORS_ORIGINS`; the dashboard may override)
- **Location:** `apps/api/src/main.ts:44-48`; `.do/app.yaml:24-54`
- **Evidence:** `app.enableCors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true })`. Consoles and the app use bearer tokens in `localStorage`/`AsyncStorage`, not cookies, so a third-party origin cannot ride an existing session (no CSRF). The exposure is limited to making the API callable from any web origin with a stolen token.
- **Fix:** Set `CORS_ORIGINS` in production and fail boot when `NODE_ENV=production` and it is empty. **Effort:** S

### AUTHZ-26 — Expo push tokens can be re-bound to another person
- **Severity:** Low. **CVSS 3.1:** AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:L = 3.8
- **Confidence:** Confirmed
- **Location:** `packages/db/prisma/sql/2026-08-04_push_tokens.sql:28-34`
- **Evidence:** `ON CONFLICT (token) DO UPDATE SET person_id = EXCLUDED.person_id`. Any wallet session that learns another device's Expo token (they are not secret in Expo's model) can claim it; the victim stops receiving notifications and receives the attacker's. Sending is not built yet, so impact is latent.
- **Fix:** On conflict with a different `person_id`, delete the old row only when the old person's session is gone, or keep `(token, person_id)` as the key. **Effort:** S

### AUTHZ-27 — eReceipt token is client-generated and only `@IsString()`
- **Severity:** Info. **CVSS 3.1:** AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N = 3.1
- **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/terminal-gateway/dto.ts:45-48`; `terminal.service.ts:265-300`; `CheckoutViewModel.kt:421`
- **Evidence:** The first-party terminal uses `UUID.randomUUID()` (122 bits, fine). Third-party POS integrations using brand API keys (which pass `TerminalHmacGuard`, `terminal-hmac.guard.ts:61-66`, `terminalId` null) can post `"token":"1"`; the public page `/v1/r/:token` then exposes that receipt (member name, masked PAN, balance) to anyone. The lookup has no brand clause (AUTHZ-20).
- **Fix:** Validate `token` as UUID/≥22 base64url chars, or generate server-side and return it (the offline replay case can keep a client-supplied idempotency key separate from the public token). **Effort:** S

### AUTHZ-28 — Docs portal: 30-day shared-code cookie, derived fallback signing key, fixed-delay brute-force control only
- **Severity:** Info. **CVSS 3.1:** AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N = 3.7
- **Confidence:** Confirmed
- **Location:** `apps/docs/lib/auth.ts:11-12`, `:36-42`; `apps/docs/app/api/access/route.ts:13-20`, `:26-35`
- **Evidence:** Session cookie is `httpOnly; secure (prod); sameSite=lax; 30 d`, HMAC-SHA256 signed, constant-time compared, partner-revocable — all good. If `DOCS_COOKIE_SECRET` is unset the key is the concatenation of the access codes themselves (`:41`), so a leaked code also forges sessions for every other partner label. Brute force is slowed by a 600 ms delay per failure (`:15`) with no per-IP counter on an Edge route; codes must be ≥8 chars.
- **Fix:** Require `DOCS_COOKIE_SECRET` in production; add Vercel WAF rate limiting on `/api/access`. **Effort:** S

---

## 2. Endpoint authorization matrix

Legend — Guard: `A`=AdminJwtGuard, `P`=PermissionsGuard, `C`=CustomerJwtGuard, `W`=WalletJwtGuard, `H`=TerminalHmacGuard, `–`=none. Scoping: `RLS+brand` = `TenantService.run` sets the caller's single GUC and the service adds `where brandId: ctx.brandId`; `RLS+platform` = platform GUC and `where platformId`; `definer(person)` = SECURITY DEFINER function keyed by `personId` from the token; `auth-db` = owner-role `AuthPrismaService`; `token` = capability in the token/URL. Verdict `OK` means no issue beyond those listed under the ID(s).

| Method | Path | Guard | Permission | Tenant scoping | Verdict |
|---|---|---|---|---|---|
| POST | /v1/auth/login | – | – | auth-db by email | AUTHZ-01, -03, -04, -14 |
| POST | /v1/auth/mfa | – | – | auth-db | AUTHZ-16, -04 |
| POST | /v1/auth/token | – | – | auth-db by token hash | AUTHZ-06 (no throttle, no status check) |
| POST | /v1/auth/logout | – | – | auth-db by token hash | AUTHZ-06 (single token only) |
| POST | /v1/auth/mfa/enrol | A | – | actor.id | AUTHZ-03 |
| POST | /v1/auth/mfa/confirm | A | – | actor.id | OK |
| POST | /v1/customer/auth/otp | – | – | definer(phone hash) | AUTHZ-04 |
| POST | /v1/customer/auth/verify | – | – | auth-db person+membership(brandId body) | OK (brand re-checked) |
| POST | /v1/customer/auth/wallet | – | – | definer(phone hash) | AUTHZ-15, -11 |
| POST | /v1/customer/auth/refresh | – | – | auth-db by token hash + personId | AUTHZ-06, -11 |
| GET | /v1/admin/diagnostics/whoami | A | – | token echo | OK (no secrets; returns claims) |
| GET | /v1/admin/diagnostics/visible-brands | A,P | brand.report.read | RLS counts | OK |
| GET | /v1/customer/diagnostics/whoami | C | – | token echo | OK |
| GET | /v1/terminal/diagnostics/ping | H | – | key→tenant | OK |
| GET | /v1/manage/api-keys | A,P | brand.report.read | RLS+brand, terminalId null | OK (no secrets returned) |
| POST | /v1/manage/api-keys | A,P | brand.manage | RLS+brand | OK |
| POST | /v1/manage/api-keys/:id/rotate | A,P | brand.manage | RLS+brand `where {id, brandId}` | OK |
| DELETE | /v1/manage/api-keys/:id | A,P | brand.manage | RLS+brand `where {id, brandId}` | OK |
| POST | /v1/manage/coupons/bulk-generate | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/manage/coupons | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/coupons/batches | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/coupons/export.csv | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/coupons/validate | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/coupons/redeem | A,P | brand.manage | RLS+brand | OK |
| PATCH | /v1/manage/coupons/:id | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/customer/app-status | – | – | env only | OK |
| GET | /v1/customer/wallet/cards | W | – | definer(person) | OK |
| GET | /v1/customer/wallet/vouchers | W | – | definer(person) | OK |
| GET | /v1/customer/wallet/activity | W | – | definer(person) | OK |
| GET | /v1/customer/wallet/profile | W | – | definer(person) | OK |
| PATCH | /v1/customer/wallet/profile | W | – | definer(person) | OK |
| GET | /v1/customer/wallet/brands | W | – | definer(person) | OK |
| POST | /v1/customer/wallet/brands/:brandId/join | W | – | definer(person, brand status+platform match) | OK — any active brand is joinable by design |
| GET | /v1/customer/wallet/cards/:brandId/scan-code | W | – | definer(person, membership) | OK |
| POST | /v1/customer/wallet/cards/:brandId/token | W | – | auth-db `customerMembership{personId,brandId}` active | OK — membership re-checked; extra refresh row per mint (AUTHZ-06 note) |
| PATCH | /v1/customer/wallet/email | W | – | definer(person) | OK (unverified email, Low) |
| POST | /v1/customer/wallet/push-token | W | – | definer(person) | AUTHZ-26 |
| GET | /v1/customer/wallet/offers | W | – | definer(person) | OK |
| GET | /v1/customer/wallet/branch-visits | W | – | definer(person) | OK |
| PATCH | /v1/customer/wallet/home-branch | W | – | definer(person, membership check) | OK |
| GET | /v1/customer/wallet/sessions | W | – | definer(person) | OK |
| DELETE | /v1/customer/wallet/sessions/:id | W | – | definer(person AND id) | OK |
| GET/POST/DELETE | /v1/customer/wallet/deletion | W | – | definer(person) | OK; AUTHZ-11 |
| POST | /v1/manage/change-requests | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/manage/change-requests | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/change-requests/:id | A,P | brand.report.read | RLS+brand | OK |
| DELETE | /v1/manage/change-requests/:id | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/admin/change-requests | A,P | platform.report.read | RLS+platform `where platformId` | AUTHZ-07 (brand analyst reaches it) |
| GET | /v1/admin/change-requests/:id | A,P | platform.report.read | RLS+platform | AUTHZ-07 |
| PATCH | /v1/admin/change-requests/:id/approve | A,P | platform.manage | RLS; applies under brandCtx built from CR | OK |
| PATCH | /v1/admin/change-requests/:id/reject | A,P | platform.manage | RLS | OK |
| POST | /v1/admin/change-requests/bulk-approve | A,P | platform.manage | RLS | OK |
| POST | /v1/admin/change-requests/bulk-reject | A,P | platform.manage | RLS | OK |
| GET | /v1/admin/governance-stats | A,P | platform.report.read | RLS | AUTHZ-07 |
| GET | /v1/admin/brands/:brandId/governance | A,P | platform.report.read | RLS | AUTHZ-07 |
| PATCH | /v1/admin/brands/:brandId/governance | A,P | platform.manage | RLS | OK |
| GET | /v1/customer/balance | C | – | RLS+brand, membership by actor.id | OK |
| GET | /v1/customer/transactions | C | – | RLS+brand, account by membership | OK |
| GET | /v1/customer/expiring | C | – | RLS+brand, membership | OK |
| GET | /v1/customer/rewards | C | – | RLS+brand | OK |
| POST | /v1/customer/rewards/:id/redeem | C | – | RLS+brand, membership from token | OK |
| POST | /v1/customer/vouchers/:code/redeem | C | – | `v.brandId===ctx.brandId && v.membershipId===mine` | OK |
| GET | /v1/customer/badges | C | – | RLS+brand, membership | OK |
| GET | /v1/customer/challenges | C | – | RLS+brand, membership | OK |
| GET | /v1/customer/program | C | – | RLS+brand | OK |
| GET | /v1/customer/leaderboard | C | – | RLS+brand | OK (returns membership ids + lifetime only) |
| GET | /v1/customer/referral-code | C | – | RLS+brand, membership | OK |
| POST | /v1/customer/referral/redeem | C | – | `ref.brandId===ctx.brandId` | OK (authz); eligibility logic is domain 03 |
| GET | /v1/manage/earn-rules | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/earn-rules/:id | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/earn-rules | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| PATCH | /v1/manage/earn-rules/:id | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| DELETE | /v1/manage/earn-rules/:id | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| POST | /v1/manage/earn-rules/:id/clone | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/manage/rewards | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/rewards/:id | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/rewards | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| PATCH | /v1/manage/rewards/:id | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| DELETE | /v1/manage/rewards/:id | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| POST | /v1/manage/rewards/:id/clone | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/manage/tiers | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/tiers/:id | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/tiers | A,P (+Governed) | brand.manage | RLS+brand | OK |
| PATCH | /v1/manage/tiers/:id | A,P (+Governed) | brand.manage | RLS+brand | OK |
| DELETE | /v1/manage/tiers/:id | A,P (+Governed) | brand.manage | RLS+brand | OK |
| GET | /v1/manage/campaigns | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/campaigns/:id | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/campaigns | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| PATCH | /v1/manage/campaigns/:id | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| DELETE | /v1/manage/campaigns/:id | A,P (+Governed) | brand.campaign.write | RLS+brand | OK |
| POST | /v1/manage/campaigns/:id/clone | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/manage/badges | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/badges/:id | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/badges | A,P | brand.campaign.write | RLS+brand | OK |
| PATCH | /v1/manage/badges/:id | A,P | brand.campaign.write | RLS+brand | OK |
| DELETE | /v1/manage/badges/:id | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/manage/challenges | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/challenges/:id | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/challenges | A,P | brand.campaign.write | RLS+brand | OK |
| PATCH | /v1/manage/challenges/:id | A,P | brand.campaign.write | RLS+brand | OK |
| DELETE | /v1/manage/challenges/:id | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/manage/members | A,P | brand.customer.read | RLS+brand | OK |
| GET | /v1/manage/customers/:id/profile | A,P | brand.customer.read | `where {id, brandId}` + RLS | OK |
| PATCH | /v1/manage/customers/:id/profile | A,P | brand.manage | `where {id, brandId}` | OK |
| GET | /v1/manage/customers/:id/export | A,P | brand.customer.read | `where {id, brandId}` | OK |
| DELETE | /v1/manage/customers/:id | A,P | brand.manage | `where {id, brandId}` | OK |
| GET | /v1/manage/modules | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/redemption-config | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/settings | A,P | brand.report.read | RLS+brand | OK |
| PATCH | /v1/manage/settings | A,P | brand.manage | RLS+brand | OK |
| GET | /v1/manage/audit-logs | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/customers/earn | A,P | brand.manage | RLS+brand (membershipId body) | OK (authz); amount limits are domain 03 |
| GET | /v1/manage/templates/variables | A,P | brand.report.read | static | OK |
| POST | /v1/manage/templates/preview | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/templates | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/templates/:id | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/templates | A,P | brand.campaign.write | RLS+brand | OK |
| PATCH | /v1/manage/templates/:id | A,P | brand.campaign.write | RLS+brand | OK |
| DELETE | /v1/manage/templates/:id | A,P | brand.campaign.write | RLS+brand | OK |
| GET | /v1/admin/partners | A,P | platform.report.read | RLS+platform | AUTHZ-07 |
| POST | /v1/admin/partners/lulu/ensure | A,P | platform.manage | RLS+platform | OK |
| PATCH | /v1/admin/partners/merchants/:id | A,P | platform.manage | RLS+platform | OK |
| GET | /v1/admin/partners/topup-requests | A,P | platform.report.read | RLS | AUTHZ-07 |
| POST | /v1/admin/partners/topup-requests/:id/{invoice,confirm,reject} | A,P | platform.manage | RLS | OK |
| GET | /v1/admin/partners/conversions/:id | A,P | platform.report.read | RLS | AUTHZ-07 |
| GET | /v1/admin/partners/:partnerId | A,P | platform.report.read | RLS | AUTHZ-07 |
| PATCH | /v1/admin/partners/:partnerId | A,P | platform.manage | RLS | OK |
| GET | /v1/admin/partners/:partnerId/{health,merchants,overview,trend,conversions,conversions.csv} | A,P | platform.report.read | RLS | AUTHZ-07 |
| POST | /v1/admin/partners/:partnerId/merchants | A,P | platform.manage | RLS | OK |
| POST | /v1/admin/partners/:partnerId/allowance/{fund,threshold} | A,P | platform.manage | RLS | OK |
| GET | /v1/manage/lulu/{status,reports,activity,activity.csv,ledger,topups} | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/lulu/conversions/:id | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/lulu/topup-request | A,P | brand.manage | RLS+brand | OK |
| POST | /v1/customer/partners/link | C | – | membership by actor.id + brand; link by personId | OK |
| POST | /v1/customer/partners/preview | C | – | same | OK |
| POST | /v1/customer/partners/convert | C | – | same | OK |
| GET | /v1/customer/partners/conversions | C | – | same | OK |
| GET | /v1/manage/reports/{summary,rfm,trend,by-type,rfm.csv,clv,visit-frequency,cohorts,churn-risk,liability-aging,by-branch,engagement,clv.csv,visit-frequency.csv,churn-risk.csv} | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/reports/{rollup,rfm-snapshot} | A,P | brand.report.read | RLS+brand (writes with a read permission) | Low: a read permission triggers writes; harmless but mis-tiered |
| GET | /v1/admin/reports/overview | A,P | platform.report.read | RLS+platform | AUTHZ-07 |
| POST | /v1/manage/segments/preview | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/segments/fields | A,P | **none** | static | OK — static metadata, no tenant data; still add `brand.report.read` for consistency |
| GET | /v1/manage/segments | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/segments/:id | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/segments/:id/members | A,P | brand.customer.read | RLS+brand | OK |
| POST | /v1/manage/segments | A,P | brand.campaign.write | RLS+brand | OK |
| PATCH | /v1/manage/segments/:id | A,P | brand.campaign.write | RLS+brand | OK |
| DELETE | /v1/manage/segments/:id | A,P | brand.campaign.write | RLS+brand | OK |
| POST | /v1/admin/groups | A,P | platform.manage | RLS+platform | OK |
| GET | /v1/admin/groups | A,P | platform.report.read | RLS+platform | AUTHZ-07 |
| GET | /v1/admin/groups/:groupId | A,P | platform.report.read | `where {id, platformId}` | AUTHZ-07 |
| PATCH | /v1/admin/groups/:groupId | A,P | platform.manage | `where {id, platformId}` | OK |
| POST | /v1/admin/groups/:groupId/status | A,P | platform.manage | `where {id, platformId}` | AUTHZ-10 (terminals keep working) |
| GET | /v1/admin/groups/:groupId/wallet/ledger | A,P | platform.report.read | raw SQL `la.group_id=` + RLS | AUTHZ-07 |
| GET | /v1/admin/groups/:groupId/cost-rules | A,P | platform.report.read | `where {groupId}` + RLS | AUTHZ-07 |
| POST | /v1/admin/groups/:groupId/brands | A,P | platform.manage | create with ctx.platformId | OK |
| POST | /v1/admin/groups/:groupId/wallet/topup | A,P | group.wallet.manage | RLS only (no platform check) | **AUTHZ-02** |
| POST | /v1/admin/groups/:groupId/cost-rule | A,P | group.wallet.manage | RLS only | **AUTHZ-02** |
| GET | /v1/admin/brands | A,P | platform.report.read | RLS+platform | AUTHZ-07 |
| GET | /v1/admin/search | A,P | platform.report.read | RLS+platform | AUTHZ-07 |
| GET | /v1/admin/roles | A,P | platform.report.read | static | AUTHZ-22 (cosmetic catalogue) |
| GET | /v1/admin/settings | A,P | platform.report.read | `platform.findUnique(ctx.platformId)` + RLS | AUTHZ-07 (empty for brand principals) |
| PATCH | /v1/admin/settings | A,P | platform.manage | RLS+platform | OK |
| PATCH | /v1/admin/brands/:brandId | A,P | platform.manage | `where {id, platformId}` | OK |
| POST | /v1/admin/brands/:brandId/branches | A,P | platform.manage | `brand.findUnique(id)` + RLS | OK (RLS confines) |
| GET | /v1/admin/brands/:brandId/branches | A,P | platform.report.read | `where {brandId, platformId}` | AUTHZ-07 |
| PATCH | /v1/admin/branches/:branchId/status | A,P | platform.manage | `where {id, platformId}` | AUTHZ-10 |
| GET | /v1/admin/brands/:brandId/terminals | A,P | platform.report.read | `where {brandId, platformId}` | AUTHZ-07 |
| POST | /v1/admin/brands/:brandId/terminals | A,P | platform.manage | branch∈brand∈platform | OK |
| PATCH | /v1/admin/terminals/:terminalId/status | A,P | platform.manage | `where {id, platformId}` | AUTHZ-10 |
| GET | /v1/admin/customers | A,P | platform.report.read | `where platformId` + RLS person policy | **AUTHZ-07** (decrypted PII) |
| GET | /v1/admin/customers/:personId | A,P | platform.report.read | `where {id, platformId}` + RLS | **AUTHZ-07** |
| GET | /v1/admin/vouchers | A,P | platform.report.read | `where platformId` + RLS | AUTHZ-07 |
| GET | /v1/admin/brands/:brandId/rewards | A,P | platform.report.read | `where {brandId, platformId}` | AUTHZ-07 |
| POST | /v1/admin/vouchers | A,P | platform.manage | membership∈platform, item∈brand | OK |
| POST | /v1/admin/vouchers/:voucherId/cancel | A,P | platform.manage | `where {id, platformId}` | OK |
| GET | /v1/admin/receipt-stats | A,P | platform.report.read | raw SQL on `receipt` (no RLS) `platform_id=` | AUTHZ-07, -20 (brand principal sees all brands' receipt stats) |
| GET | /v1/admin/brands/:brandId/redemption-config | A,P | platform.report.read | `where {id, platformId}` | AUTHZ-07 |
| PATCH | /v1/admin/brands/:brandId/redemption-config | A,P | platform.manage | `where {id, platformId}` | OK |
| DELETE | /v1/admin/branches/:branchId | A,P | platform.manage | `where {id, platformId}` | OK |
| DELETE | /v1/admin/terminals/:terminalId | A,P | platform.manage | `where {id, platformId}`; deletes keys | OK |
| POST | /v1/admin/terminals/:terminalId/keys | A,P | platform.manage | `where {id, platformId}` | OK — secret returned once, audit stores keyId only |
| POST | /v1/admin/terminals/:terminalId/keys/revoke | A,P | platform.manage | `where {id, platformId}` | OK |
| GET | /v1/admin/analytics | A,P | platform.report.read | raw SQL `platform_id=` + RLS | AUTHZ-07 |
| GET | /v1/admin/brands-directory | A,P | platform.report.read | raw SQL + RLS | AUTHZ-07 |
| GET | /v1/admin/wallet/low-balance | A,P | platform.report.read | raw SQL + RLS | AUTHZ-07 |
| GET | /v1/admin/audit-logs | A,P | platform.report.read | `where platformId` + RLS | AUTHZ-07 |
| GET | /v1/admin/team | A,P | platform.report.read | raw SQL `ra.platform_id=` + RLS(user_account platform) | AUTHZ-07 (empty for brand principals) |
| GET | /v1/admin/team/roles | A,P | platform.report.read | static | OK |
| POST | /v1/admin/team/invite | A,P | platform.manage | PLATFORM_ROLES allow-list | AUTHZ-08, -24 |
| PATCH | /v1/admin/team/:userId/role | A,P | platform.manage | assignment∈platform; self-elevation possible but caller is already platform.manage | OK |
| DELETE | /v1/admin/team/:userId | A,P | platform.manage | self-revoke blocked | OK |
| GET | /v1/admin/brands/:brandId/modules | A,P | platform.report.read | `where {id, platformId}` | AUTHZ-07 |
| PATCH | /v1/admin/brands/:brandId/modules | A,P | platform.manage | `where {id, platformId}` | OK |
| POST | /v1/admin/brands/:brandId/act-as | A,P | platform.manage | `where {id, platformId}`; audited | AUTHZ-09, -23 |
| GET | /v1/admin/terminal-releases | A,P | platform.report.read | RLS (broken GUC) | AUTHZ-12 |
| POST | /v1/admin/terminal-releases | A,P | platform.manage | RLS (broken GUC) | AUTHZ-12 |
| POST | /v1/admin/terminal-releases/:id/publish | A,P | platform.manage | RLS (broken GUC) | AUTHZ-12 |
| GET | /v1/manage/team | A,P | brand.manage | RLS (user_account invisible) | AUTHZ-13 |
| GET | /v1/manage/team/roles | A,P | brand.manage | static | OK |
| POST | /v1/manage/team/invite | A,P | brand.manage | BRAND_ROLES allow-list; cannot grant platform roles (verified `team.service.ts:9,48`) | AUTHZ-08, -13, -24 |
| PATCH | /v1/manage/team/:userId/role | A,P | brand.manage | assignment `scopeId: ctx.brandId` | OK |
| DELETE | /v1/manage/team/:userId | A,P | brand.manage | `scopeId: ctx.brandId` | OK |
| GET | /v1/r/:token | – | – | token (UUID from first-party till) | AUTHZ-27, -20 |
| GET | /v1/r/:token/pdf | – | – | token | AUTHZ-27 |
| GET | /v1/terminal/config | H | – | key→brand | OK |
| GET | /v1/terminal/app-version | H | – | key→terminal (`updateMany where id: actor.id`) | OK; query unsigned (AUTHZ-17) |
| POST | /v1/terminal/members/resolve | H | – | `brandId_type_valueHash` with ctx.brandId | OK |
| POST | /v1/terminal/members/enroll | H | – | definer(person) + membership in ctx.brandId | OK |
| POST | /v1/terminal/receipts | H | – | brand from ctx; token lookup has no brand clause | AUTHZ-20, -27 |
| POST | /v1/terminal/members/vouchers | H | – | member token brand check + `where {membershipId, brandId}` | AUTHZ-18 |
| POST | /v1/terminal/vouchers/redeem | H | – | `v.brandId===ctx.brandId` (+member check if token given) | OK |
| POST | /v1/terminal/members/context | H | – | member token brand check + `where {id, brandId}` | AUTHZ-18 |
| POST | /v1/terminal/quotes | H | – | member token brand check | AUTHZ-18 |
| POST | /v1/terminal/transactions | H | – | member token brand check; idempotency | AUTHZ-18, -10 |
| POST | /v1/terminal/transactions/:id/capture | H | – | `where {id, brandId}` | OK |
| POST | /v1/terminal/transactions/:id/void | H | – | `where {id, brandId}` | OK |
| GET | /v1/terminal/transactions/:id | H | – | `where {id, brandId}` | OK |
| POST | /v1/terminal/transactions/batch | H | – | per-op as above | OK |
| POST | /v1/devices/:dev/registrations/:type/:serial | – (ApplePass token) | – | HMAC(serial) | AUTHZ-21 |
| DELETE | /v1/devices/:dev/registrations/:type/:serial | – (ApplePass token) | – | HMAC(serial) | AUTHZ-21 |
| GET | /v1/devices/:dev/registrations/:type | – | – | device id only | AUTHZ-21 |
| GET | /v1/passes/:type/:serial | – (ApplePass token) | – | HMAC(serial); definer(no person) | AUTHZ-21 |
| POST | /v1/log | – | – | none (log sink, capped 20×300 chars) | OK |
| GET | /v1/customer/wallet/passes/availability | W | – | config | OK |
| GET | /v1/customer/wallet/passes/:membershipId/google | W | – | definer(membership, person) | OK |
| GET | /v1/customer/wallet/passes/:membershipId/apple | W | – | definer(membership, person) → 5-min typed token | OK |
| GET | /v1/passes/apple/:token | – | – | token (`typ: apple_pass`, sub+mid) | OK |
| GET | /v1/manage/webhooks/event-types | A,P | brand.report.read | static | OK |
| GET | /v1/manage/webhooks/deliveries | A,P | brand.report.read | RLS+brand | OK |
| GET | /v1/manage/webhooks | A,P | brand.report.read | RLS+brand | OK |
| POST | /v1/manage/webhooks | A,P | brand.manage | RLS+brand | OK |
| PATCH | /v1/manage/webhooks/:id | A,P | brand.manage | RLS+brand | OK |
| DELETE | /v1/manage/webhooks/:id | A,P | brand.manage | RLS+brand | OK |
| POST | /v1/manage/webhooks/:id/rotate-secret | A,P | brand.manage | RLS+brand | OK |
| POST | /v1/manage/webhooks/:id/test | A,P | brand.manage | RLS+brand | OK (SSRF review is domain 01/03) |
| GET | /v1/assets/logo.png | – | – | static constant | OK (no brand parameter; platform logo only) |
| GET | /health, /ready, /metrics | – | – | none | OK for this domain (content review is domain 07) |

Handlers under `AdminJwtGuard` **without** `@RequirePermissions`: `/v1/auth/mfa/enrol`, `/v1/auth/mfa/confirm`, `/v1/admin/diagnostics/whoami`, `/v1/manage/segments/fields`. Any admin-surface token (including `brand_manager` with zero permissions) reaches these; only `mfa/enrol` is harmful (AUTHZ-03).

Scope/brand selection by the client: **not possible**. `scopeLevel`, `brandId`, `groupId`, `roles` are derived from `RoleAssignment` at login/refresh (`auth.service.ts:295-317`); login/MFA/refresh DTOs carry no scope fields; act-as derives scope from the DB brand row (`superadmin.service.ts:117-131`); customer brand tokens derive scope from the membership row (`:234-255`). Group-level tokens never populate `ctx.brandId` (null), and no service was found trusting a null `brandId` to widen a query — `where { brandId: null }` matches nothing and inserts fail on NOT NULL.

---

## 3. Not assessed

- Production state: whether the seed ran against Supabase (AUTHZ-01), whether `CORS_ORIGINS` / `APP_DATABASE_URL` / `DOCS_COOKIE_SECRET` are set in the DO/Vercel dashboards, whether the Supabase owner role has `BYPASSRLS` (affects AUTHZ-12's definer path), and the actual proxy hop count for AUTHZ-04.
- Runtime confirmation of RLS behaviour: `apps/api/test/*.e2e.test.ts` run as the DB owner (no `loyalty_app` / `SET ROLE` anywhere in `apps/api/test`), so AUTHZ-05, -12, -13 are static conclusions; `packages/db/test/rls.test.ts` covers six policy cases on brand/group/platform/membership only.
- Money-flow correctness (amount limits, referral eligibility, idempotency semantics, settlement maths) — domain 03/09.
- Web console XSS, CSP, dependency CVEs, secret handling in CI — domains 01/06/08.
- Apple/Google pass signing material handling, APNs, SMS/WhatsApp template injection — domain 05/07.
- Lulu partner connector (stub) authentication — nothing to assess yet.
- The uncommitted membership-card load/spend work (`packages/db/src/ledger/operations.ts`, `2026-08-06_membership_load_spend.sql`) has no routes yet; no authorization surface to review.

## 4. Positive controls verified

- Argon2id (`@node-rs/argon2`) for staff passwords; TOTP secrets envelope-encrypted (AES-256-GCM) at rest; OTP codes stored as SHA-256 only, single-use, 5-minute TTL, 5 attempts, serialised with `FOR UPDATE` in SQL (`2026-07-28_otp_code.sql`).
- Separate secrets for access vs refresh JWTs; refresh tokens stored hashed (`sha256`) with rotation and `replacedBy` linkage; customer refresh verifies `stored.personId === payload.sub` and `surface === 'customer'`.
- Guard discrimination by `surface`: wallet tokens are rejected by `CustomerJwtGuard`, brand tokens by `WalletJwtGuard`, member/pass tokens by all three; pass links check `typ === 'apple_pass'`; `none`/RS algorithm confusion impossible with a symmetric secret in `@nestjs/jwt@11` / `jsonwebtoken@9.0.3`.
- Act-as tokens are access-only (no refresh issued), 15-minute, audited (`brand.act_as`) and governance bypass is explicit (`elevated`).
- `TenantService` sets exactly one scope GUC per principal with `set_config(..., true)` (transaction-local, pooler-safe); RLS policies use `nullif(current_setting(...,true),'')` so an unset context fails closed; `WITH CHECK` mirrors `USING` on every tenant table; `audit_log`/`journal`/`entry` are append-only by trigger.
- Every person-level wallet read goes through `SECURITY DEFINER` functions keyed by `personId` from the verified token; `wallet_revoke_session`, `wallet_set_home_branch`, `wallet_scan_code`, `wallet_pass_data(person)` all bind the person in the same statement; `brandTokenForWallet` re-checks membership in the DB rather than trusting the wallet token.
- Terminal HMAC: canonical string covers method, path (with `/v1` prefix on both client and server), timestamp, nonce and SHA-256 of the raw body; constant-time compare; ±300 s skew; secrets issued once with 192-bit entropy, stored hashed + envelope-encrypted, audit stores only the key id; Android stores the secret under an AndroidKeyStore AES-GCM key; receipt tokens are UUIDv4 on the first-party till.
- Brand team invites cannot grant platform roles (`BRAND_ROLES` allow-list); platform invites cannot be reached without `platform.manage`; self-revocation is blocked; every `:id` route under `/v1/manage/*` and `/v1/terminal/*` that was read adds an explicit `brandId` predicate in addition to RLS.
- Docs portal: signed, `httpOnly`, `secure`, `sameSite=lax` cookie; constant-time code comparison; open-redirect protection in `safeNextPath`.
- `helmet()` default headers, `ValidationPipe` with `whitelist + forbidNonWhitelisted`, pino redaction of `authorization`/`cookie`/`x-api-key`, Swagger disabled in production unless explicitly enabled.
