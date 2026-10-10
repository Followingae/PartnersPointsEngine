# 03 — API Security (OWASP API Security Top 10 2023)

Audit date: 2026-10-10. Scope: `apps/api` (NestJS 11 / Express 5.2.1 / `@nestjs/throttler` 6.5.0 / helmet 8.2.0) at `main` @ afc3fe2 plus working tree. Read-only: static review of source, `node_modules` for library behaviour, a scratch script that diffed code routes against `apps/api/openapi.json`. No requests were sent to any environment; the API was not started.

Out of scope here (covered by other agents): login/JWT/refresh internals, IDOR within a tenant (02), ledger arithmetic and points fraud (04), RLS policy correctness (09), console/mobile clients (05/06), infra (07). Where a finding sits on the border it is noted and kept short.

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 3 | API-01, API-02, API-03 |
| Medium | 7 | API-04, API-05, API-06, API-07, API-08, API-09, API-10 |
| Low | 5 | API-11, API-12, API-13, API-14, API-15 |
| Info | 3 | API-16, API-17, API-18 |

Headline: the rate limiter is effectively disabled in production because the app never sets Express `trust proxy` behind the DigitalOcean load balancer (API-01); a brand admin can make the API server issue signed POSTs to arbitrary internal URLs through the webhook "test" button (API-02); and the maker-checker change-request path bypasses every class-validator rule on the loyalty DTOs (API-03).

---

## Findings

### API-01 — Throttler keyed on the load balancer address: one shared bucket for the whole platform (no `trust proxy`)

- **Severity:** High — **CVSS 3.1:** 7.5 `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`
- **Confidence:** Confirmed in code; production topology Likely (DO App Platform always fronts a service with its own LB and passes the client in `X-Forwarded-For`).
- **OWASP:** API4 Unrestricted Resource Consumption, API8 Security Misconfiguration
- **Location:** `apps/api/src/app.module.ts:40-43,93`; `apps/api/src/main.ts` (no `app.set('trust proxy', …)` anywhere — `grep -rn "trust proxy" apps/api/src` returns nothing); `node_modules/@nestjs/throttler/dist/throttler.guard.js:141-142`; `apps/api/src/auth/device.ts:21-23`

**Evidence**

```ts
// app.module.ts
ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
...
providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
```
```js
// @nestjs/throttler 6.5.0 throttler.guard.js
async getTracker(req) {
    return req.ip;
}
```
```ts
// device.ts — the authors assume trust-proxy is configured, but nothing configures it
// `req.ip` honours the trust-proxy setting; the socket address is the fallback
const ip = req.ip ?? req.socket?.remoteAddress ?? null;
```
Express 5 defaults `trust proxy` to `false`, so `req.ip` is the TCP peer. On App Platform the peer is DO's internal load balancer for every request. `.do/app.yaml` runs two `basic-xs` instances with no proxy configuration and no env that could switch it on.

**Impact**
- Every public caller shares the same counter per instance. `POST /v1/customer/auth/otp` is limited to 5/min *platform-wide*, `POST /v1/auth/login` and `/mfa` to 10/min, `/customer/auth/verify` to 10/min, everything else to 300/min. One script sending six OTP requests a minute keeps every customer from signing in; thirty requests a minute to `/auth/login` locks out the whole merchant console. The 429 arrives with the same `rate_limited` envelope, so it looks like legitimate traffic from the attacker's side.
- Equally, the per-IP guard against OTP pumping and password spraying provides no attribution: 300 requests/minute are shared by all customers, so an attacker that stays under the bucket is indistinguishable.
- Wallet "Security" sessions list records `ip` from `deviceOf(req)`, so every device shows the LB address (`customer-auth.controller.ts:48,56`).
- Note the inverse trap: setting `trust proxy` to `true` would let anyone spoof `X-Forwarded-For` and have a fresh bucket per request. It must be set to the number of trusted hops (`1` on App Platform) or to the LB CIDR.

**Exploit scenario**: `for i in $(seq 1 10); do curl -s -X POST https://api.partnerspoints.ae/v1/customer/auth/otp -d '{"phone":"+971500000000"}' -H 'content-type: application/json'; done` once a minute, forever. Customers see "Too many codes requested" on first try.

**Fix (S):** In `main.ts` after `NestFactory.create`: `app.getHttpAdapter().getInstance().set('trust proxy', 1)` (or the LB's CIDR); add an e2e test that sends `X-Forwarded-For` and asserts the throttler keys on it. Move the throttler store to Valkey (`@nestjs/throttler-storage-redis`) so the two replicas share counters, and add a second named throttler per authenticated principal (`sub`/API key id) for the admin and terminal surfaces.

---

### API-02 — SSRF: brand admins can point webhook endpoints at any URL and make the server call it synchronously

- **Severity:** High — **CVSS 3.1:** 7.1 `AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:L`
- **Confidence:** Confirmed (code)
- **OWASP:** API7 Server Side Request Forgery, API4
- **Location:** `apps/api/src/modules/webhooks/dto.ts:4-14,16-20`; `apps/api/src/modules/webhooks/webhook-admin.controller.ts:37-48,62-67`; `apps/api/src/modules/workers/webhook.service.ts:38,69-79,87-99,138-150,185-224`

**Evidence**

```ts
// dto.ts — the only validation on the URL is "is a string"
export class RegisterWebhookDto {
  @IsString()
  url!: string;
```
```ts
// webhook.service.ts testFire — fetches whatever is stored, returns status or the error text
const ep = await this.tenants.run(ctx, (tx) => tx.webhookEndpoint.findFirst({ where: { id, brandId: ctx.brandId! } }));
...
const res = await this.fetchImpl(ep.url, { method: 'POST', headers: {...}, body });
return { ok: res.ok, status: res.status };
} catch (e) {
  return { ok: false, status: 0, error: e instanceof Error ? e.message : 'error' };
}
```
`fetchImpl` is global `fetch` (undici): follows redirects, no timeout, no DNS/IP filtering. The same URL is later hit by the background deliverer on every API instance (`deliverPending`).

**Impact**
- A `brand.manage` user (any brand admin, or a superadmin acting-as) can POST to `http://169.254.169.254/metadata/v1/…`, `http://10.x.x.x:6379`, the Supabase pooler on `:6543`, `http://localhost:3001/health`, or any VPC neighbour, and get a response oracle: HTTP status for HTTP targets, and the raw `ECONNREFUSED`/`ETIMEDOUT`/`ENOTFOUND` text for anything else. That is a port/host scanner behind the firewall with a bonus `POST` body it partially controls (event `type`/`data`) sent over and over by the worker.
- Scheme is not restricted either, so `http://` endpoints receive HMAC-signed loyalty events (member ids, points) in cleartext.
- No timeout: `testFire` holds the HTTP request open until undici's 300 s header timeout; a tarpit endpoint also stalls the webhook worker loop for every tenant (see API-07).

**Exploit scenario**: `POST /v1/manage/webhooks {"url":"http://10.124.0.3:6379/","events":["*"]}` → `POST /v1/manage/webhooks/{id}/test` → `{ "ok": false, "status": 0, "error": "fetch failed" }` vs `{ "ok": false, "status": 400 }` distinguishes closed vs open; iterate hosts/ports.

**Fix (M):** Validate on register/update: `https:` only, hostname must resolve to a public unicast address (resolve first, then connect to the resolved IP, re-check after redirects or disable redirects), reject IP literals/private ranges/link-local/loopback/`.internal`, reject ports other than 443 (or an allowlist). Wrap every outbound call in `AbortSignal.timeout(10_000)`. Return only `{ ok, status }` and a generic error string. Consider forcing an endpoint ownership challenge (one-time GET verification token) before delivery starts.

---

### API-03 — Change-request (maker-checker) path bypasses DTO validation: unvalidated payloads reach the services on approval

- **Severity:** High (business) — **CVSS 3.1:** 4.8 `AV:N/AC:H/PR:L/UI:R/S:U/C:N/I:H/A:N`
- **Confidence:** Confirmed (code)
- **OWASP:** API3 Broken Object Property Level Authorization (mass assignment / property validation bypass), API6
- **Location:** `apps/api/src/modules/governance/dto.ts:19-22`; `apps/api/src/modules/governance/brand-governance.controller.ts:19-24`; `apps/api/src/modules/governance/governance.interceptor.ts:28,45-50`; `apps/api/src/modules/governance/governance.service.ts:77-99,181-190`; `apps/api/src/modules/loyalty-rules/loyalty.appliers.ts:30-65`; `apps/api/src/modules/loyalty-rules/loyalty.service.ts:854-895,409-426`

**Evidence**

Two entry points store an arbitrary object as `proposedPayload`:
```ts
// dto.ts — any JSON object is accepted
@IsOptional() @IsObject()
payload?: Record<string, unknown>;
```
```ts
// governance.interceptor.ts — NestJS runs interceptors BEFORE pipes, so req.body here is the raw body;
// the request never reaches ValidationPipe (whitelist/forbidNonWhitelisted) because a 409 is thrown instead.
const cr = await this.governance.submit(ctx, { entityType, action, entityId: req.params?.id ?? null, payload: req.body ?? {} });
throw new ConflictException({...});
```
On approval the raw payload is passed straight to the service, cast with `as never`:
```ts
// governance.service.ts approve()
const payload = (cr.proposedPayload ?? {}) as Record<string, unknown>;
if (cr.action === 'create') { const created = await applier.create(brandCtx, payload); ... }
// loyalty.appliers.ts
create: (ctx, p) => this.loyalty.createCatalogItem(ctx, p as never).then(asId),
create: (ctx, p) => this.loyalty.createTier(ctx, p as never).then(asId),
```
The services trust their arguments:
```ts
// loyalty.service.ts createCatalogItem — DTO said @IsInt @Min(1); here anything BigInt() accepts
pointsCost: BigInt(dto.pointsCost),
// createTier — DTO said @IsInt; here any number incl. 1e9 or -1
multiplierBps: dto.multiplierBps ?? 10000,
```
Only earn-rule and campaign `definition` are re-validated (zod `EarnRule.parse` in `createEarnRule`/`updateEarnRule`/`createCampaign`/`updateCampaign`). Reward, tier, badge, challenge fields are not.

**Impact**
- A brand admin in `approval_required` (or `superadmin_managed` via the explicit submit endpoint) can propose a reward with `pointsCost: 0` (free voucher issuance in the app, every redemption then draws the group wallet through settlement), a tier with `multiplierBps: 100000000`, `threshold: -1`, a challenge with `rewardPoints: 1e12`, a reward with `status: "active"` on a `kind` string of their choice, or type-confused values that make `approve()` throw a 500 after `applier.create` partially ran. `bulk-approve` exists (`superadmin-governance.controller.ts:44-48`), and the stored `diff` is computed from the same unvalidated payload, so a reviewer sees what the requester typed, not what the DTO would have allowed.
- The property-level allowlist that `whitelist: true` + `forbidNonWhitelisted: true` is meant to guarantee does not exist on this path at all.

**Exploit scenario**: with governance in `approval_required` for `reward`: `POST /v1/manage/rewards {"name":"Free coffee","pointsCost":0,"kind":"voucher","discountMinor":2500}` → 409 with `changeRequestId` → superadmin bulk-approves the morning queue → every member redeems "Free coffee" for 0 points; the brand's group wallet is drawn down per voucher by `SettlementService`.

**Fix (M):** On `submit()` and again on `approve()`, run the payload through the same class-validator DTO the direct route uses (`plainToInstance(CreateCatalogItemDto, payload)` + `validate(..., { whitelist: true, forbidNonWhitelisted: true })`) keyed by `entityType`/`action` in the appliers registry; store the validated/whitelisted object, not `req.body`. Add `@Min/@Max` bounds on `multiplierBps`, `threshold`, `rewardPoints`, `target`. Add an e2e test that submits an out-of-range change request and asserts rejection on both submit and approve.

---

### API-04 — OTP endpoint is an unmetered SMS/WhatsApp pump to any country

- **Severity:** Medium — **CVSS 3.1:** 5.3 `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N`
- **Confidence:** Confirmed (code)
- **OWASP:** API4, API6 Unrestricted Access to Sensitive Business Flows
- **Location:** `apps/api/src/auth/dto/customer-auth.dto.ts:4-7`; `apps/api/src/auth/controllers/customer-auth.controller.ts:20-26`; `apps/api/src/auth/auth.service.ts:122-129`; `apps/api/src/auth/otp/otp-store.service.ts:9-14,40-55`; `apps/api/src/auth/otp/sms-sender.service.ts:63-78`

**Evidence**
```ts
@Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164' })  // any country
phone!: string;
```
```ts
// otp-store.service.ts — the only non-IP control: 5 sends per number per 15 min
const MAX_SENDS = 5; const WINDOW_SECONDS = 15 * 60;
```
`requestOtp()` issues and sends before checking whether the number belongs to anyone (`verifyOtpForWallet` says "not a member" only on verify). The per-IP 5/min guard is the one neutralised by API-01. There is no daily cap per number, no global/tenant spend cap, no country allowlist, no CAPTCHA/attestation for the public endpoint.

**Impact**: Classic SMS traffic-pumping / toll fraud: an attacker rotates numbers in a premium or revenue-share destination; each number costs the platform up to 5 messages per 15 minutes (480/day) with Twilio billing per segment or per WhatsApp conversation. With API-01 fixed the per-IP limit still allows 5 × N IPs per minute.

**Fix (S/M):** Restrict destination countries to the served markets (`+971` and an allowlist), enable Twilio Geo-Permissions and a Twilio spend trigger, add a per-number daily cap and a platform-wide per-minute/day send budget in `otp_issue`, and add proof-of-work/attestation (App Attest / Play Integrity or Turnstile) for `/customer/auth/otp`.

---

### API-05 — `platform.report.read` is held by read-only brand analysts and support staff and unlocks decrypted customer PII across `/v1/admin/*`

- **Severity:** Medium — **CVSS 3.1:** 6.5 `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`
- **Confidence:** Confirmed (code). Overlaps agent 02 (RBAC); kept here because it is the API's largest excessive-data-exposure surface.
- **OWASP:** API3 (excessive data exposure), API5 Broken Function Level Authorization
- **Location:** `apps/api/src/auth/authz/authz.service.ts:21,25`; `apps/api/src/auth/guards/admin-jwt.guard.ts:33-35`; `apps/api/src/modules/superadmin/superadmin.controller.ts:179-191,310-315,193-202,102-107`; `apps/api/src/modules/superadmin/superadmin.service.ts:457-519,523-646`

**Evidence**
```ts
platform_support: ['platform.report.read', 'group.manage', 'brand.manage'],
analyst_readonly: ['brand.report.read', 'platform.report.read'],
```
`AdminJwtGuard` accepts both `superadmin` and `brand_admin` surfaces for every `/v1/admin/*` route. `GET /v1/admin/customers` (`platform.report.read`) returns `phone: this.revealPhone(p.phoneEnc)`; `GET /v1/admin/customers/:personId` returns decrypted `phone`, `email`, `gender`, `birthdate`, `nationality`, balances and transactions across all brands. `analyst_readonly` does not hold `brand.customer.read`, yet it can list its brand's members with decrypted phone numbers here (RLS on `person` confines it to persons with a membership in the brand, `rls.sql:244-266`). `platform_support` sees the whole platform.

**Impact**: A role described as "read-only analyst" exports customer phone numbers; a support role without `platform.manage` reads every customer's phone, email and birthdate. Combined with `GET /v1/admin/search` and `/admin/vouchers` this is a complete customer directory for roles that only need aggregates.

**Fix (S):** Split `platform.report.read` from `platform.customer.read`; require the latter (superadmin only) on `/admin/customers*`, `/admin/search`, `/admin/vouchers`; remove `platform.report.read` from `analyst_readonly`; mask phone/email in list responses (`+9715****123`) and reveal only on the detail view behind an audited action.

---

### API-06 — Heavy authenticated endpoints have no cost-based limits (snapshots, bulk generation, CSV exports)

- **Severity:** Medium — **CVSS 3.1:** 4.3 `AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L`
- **Confidence:** Confirmed (code)
- **OWASP:** API4
- **Location:** `apps/api/src/modules/reporting/reporting.controller.ts:59-71`; `apps/api/src/modules/reporting/reporting.service.ts:71-93,107-124,223-245`; `apps/api/src/modules/coupons/coupon.controller.ts:19-24`; `apps/api/src/modules/coupons/coupon.service.ts:41-72,163`; `apps/api/src/modules/partnerships/partnership.service.ts:387,406`

**Evidence**
- `POST /manage/reports/rfm-snapshot` needs only `brand.report.read`; it runs the 5-way `ntile` window query over the whole ledger for the brand with `LIMIT 10_000` and then issues up to 10,000 individual `upsert` statements inside one transaction, on every call. `POST /manage/reports/rollup` likewise. Default throttle: 300/min per (shared, see API-01) IP.
- `POST /manage/coupons/bulk-generate` inserts up to 10,000 rows per call (`@Max(10000)`), unlimited calls.
- `GET /manage/reports/rfm.csv`, `/coupons/export.csv` (10,000 rows), `/admin/partners/:id/conversions.csv` and `/manage/lulu/activity.csv` (5,000) build the whole file in memory (`toCsv`) and are not streamed.
- `GET /v1/r/:token/pdf` renders a PDF with pdfkit per request, unauthenticated, under the default throttler only.

**Impact**: An analyst token (or a leaked one) can saturate the Supabase pooler and the single API process with a `while true; do curl -X POST …/rfm-snapshot; done` loop; the `rfm_snapshot` table grows by brand-member-count rows per day per brand, and bulk-generate adds 3 M coupon rows per minute per token. Because both API replicas run the workers in-process, this also starves settlement/expiry/webhook loops.

**Fix (M):** Make snapshot/rollup superadmin- or worker-only (or once per day per brand with a DB-level `asOf` guard before computing), add a per-principal throttler on `/manage/reports/*` and `/manage/coupons/bulk-generate`, stream CSVs, cap `bulk-generate` at a per-day budget per brand, and add a `statement_timeout` on the app role.

---

### API-07 — Webhook delivery loop: no timeout, no backoff, no claim across replicas, one slow tenant blocks all tenants

- **Severity:** Medium — **CVSS 3.1:** 5.0 `AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:N/A:L`
- **Confidence:** Confirmed (code)
- **OWASP:** API4, API10 (unsafe consumption of third-party endpoints)
- **Location:** `apps/api/src/modules/workers/webhook.service.ts:9,185-224`; `apps/api/src/modules/workers/worker-runner.service.ts:52-56,77-103`

**Evidence**
```ts
const MAX_ATTEMPTS = 6;
...
where: { brandId, status: { in: ['pending', 'failed'] }, attempts: { lt: MAX_ATTEMPTS } }, take: 100,
for (const d of pending) { ... await this.fetchImpl(d.endpoint.url, {...}) ... }
```
- No `nextAttemptAt`/backoff column: a failed delivery is retried on the next 30 s tick, so the documented "retried with backoff" is 6 attempts in ~3 minutes, then `dead`.
- `fetchImpl` has no timeout; `perBrand` awaits brands sequentially, so a tenant whose endpoint accepts the TCP connection and never answers holds the `webhooks` job for up to 300 s per delivery × 100 deliveries. `busy.has('webhooks')` then skips every subsequent tick for every brand.
- Both API instances run the same loop with no row claim (`UPDATE … WHERE status='pending' RETURNING`), so the same delivery can be sent twice; receivers are told to dedupe on `X-Loyalty-Event-Id`, which mitigates but does not prevent duplicate side effects in naive consumers.
- The signed body is also sent to `http://` endpoints (API-02).

**Impact**: Any brand admin can degrade or stop webhook delivery platform-wide; legitimate receivers that are briefly down lose events permanently after three minutes.

**Fix (M):** `AbortSignal.timeout`, exponential backoff with `next_attempt_at`, `FOR UPDATE SKIP LOCKED` claim, per-endpoint concurrency and circuit-breaker (auto-disable after N dead deliveries), run the loop in the dedicated worker only.

---

### API-08 — Stored HTML injection on the public e-receipt page via terminal-supplied `kind` and `currency`

- **Severity:** Medium — **CVSS 3.1:** 5.4 `AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N`
- **Confidence:** Confirmed (code)
- **OWASP:** API8 (output encoding / misconfiguration), API3
- **Location:** `apps/api/src/modules/terminal-gateway/dto.ts:50-53,62`; `apps/api/src/modules/terminal-gateway/terminal.service.ts:375-392`; `apps/api/src/modules/terminal-gateway/receipt-public.controller.ts:200-207,338-353`

**Evidence**
```ts
// dto.ts — documented as enum, validated as free string
@ApiProperty({ required: false, enum: ['sale', 'refund', 'void'] }) @IsOptional() @IsString() kind?: string;
@ApiProperty({ required: false }) @IsOptional() @IsString() currency?: string;
```
```ts
// receipt-public.controller.ts — rendered without esc()
${!isSale ? `<span class="mono" ...>${r.kind.toUpperCase()}</span>` : ''}
<div class="display" ...>${money(r.netMinor, r.currency)}</div>   // money() = `${currency} …`
```
`esc()` is applied to `brandName`, `memberName`, `pointsCode`, `tender` etc., but not to `kind` or `currency`. The page's CSP (`default-src 'none'; img-src … https:; style-src 'unsafe-inline' …`) has no `script-src`, so inline script and `javascript:` navigation are blocked, but anchors, images and arbitrary markup are not.

**Impact**: Anyone holding a terminal HMAC key (a merchant's own till, or a compromised one) can plant links/images/"call this number to claim your points" content on a `partnerspoints.ae` receipt page that the customer reaches by scanning a QR the till printed. No tenant boundary is crossed, but it is a platform-branded phishing page with a terminal's credentials as the only prerequisite.

**Fix (S):** `@IsIn(['sale','refund','void'])` on `kind`, `@Matches(/^[A-Z]{3}$/)` on `currency`, `@MaxLength` on all receipt strings, and wrap every interpolation in `esc()` (also in `money()`); add a unit test that renders a receipt with `<` in every field.

---

### API-09 — CORS reflects any origin with `credentials: true` unless `CORS_ORIGINS` is set, and the deployment spec does not set it

- **Severity:** Medium (Low if the dashboard sets the variable) — **CVSS 3.1:** 3.7 `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Confidence:** Needs verification (value lives only in the DO dashboard; `.do/app.yaml` has no `CORS_ORIGINS`)
- **OWASP:** API8
- **Location:** `apps/api/src/main.ts:45-50`; `.do/app.yaml` (envs list, no `CORS_ORIGINS`); `apps/api/src/config/env.ts` (not validated)

**Evidence**
```ts
const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',')…;
app.enableCors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true });
```
`origin: true` reflects the request's `Origin` header. `envSchema` does not require or default `CORS_ORIGINS` in production, so the failure mode is silent.

**Impact**: Tokens live in `localStorage` and are sent as bearer headers, so the classic credentialed-CORS theft does not apply today; but the combination `Access-Control-Allow-Origin: <attacker>` + `Access-Control-Allow-Credentials: true` means any future cookie (e.g. a refresh cookie, or the docs portal's session) would be readable cross-origin, and any origin can drive the API from a victim's browser with a stolen token without a server. Also `credentials: true` is unnecessary for a bearer-token API.

**Fix (S):** Make `CORS_ORIGINS` required when `NODE_ENV=production` in `env.ts`; add it to `.do/app.yaml`; drop `credentials: true`; fail boot otherwise.

---

### API-10 — Terminal surface has no rate limit at all while exposing enumeration oracles (`members/resolve` by phone, `members/enroll`)

- **Severity:** Medium — **CVSS 3.1:** 4.3 `AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N`
- **Confidence:** Confirmed (code)
- **OWASP:** API4, API6
- **Location:** `apps/api/src/modules/terminal-gateway/terminal.controller.ts:14-27,59-69,89-93`; `apps/api/src/modules/terminal-gateway/terminal.service.ts:126-145,218-266,558-595`; `apps/api/src/auth/nonce-store.service.ts`

**Evidence**: `@SkipThrottle()` on the whole controller ("tills sit behind one public address"). `POST /terminal/members/resolve {type:'phone', value}` returns a member token or 404 — a yes/no membership oracle per phone; `members/context` then yields name, tier, balance; `members/enroll` creates a `Person` for any E.164 string with no cap. HMAC keys are per terminal, so the natural key for a limit (the `publishableKeyId`) is already known at guard time but unused. The in-memory nonce store is per instance, so the same signed request can be replayed once against the other replica within the 300 s skew window (noted; auth depth is agent 02's).

**Impact**: A rogue or compromised terminal key can sweep the UAE mobile range at full API speed to build a list of the brand's members with balances, or pollute the person table with millions of fake enrolments (which also become RLS-visible "customers" for that brand).

**Fix (S/M):** Replace `@SkipThrottle` with a named throttler keyed on `publishableKeyId` (e.g. 600/min per key, 60/min on `resolve`/`enroll`); move the nonce store to Valkey; alert on resolve-miss ratio per key.

---

### API-11 — DTO property validation gaps (nested arrays unvalidated, missing bounds/enums)

- **Severity:** Low — **CVSS 3.1:** 3.1 `AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N`
- **Confidence:** Confirmed (code)
- **OWASP:** API3
- **Location:** `apps/api/src/modules/loyalty-rules/dto.ts:64-78,458-492`; `apps/api/src/modules/terminal-gateway/dto.ts:80-88`; `apps/api/src/modules/superadmin/dto.ts:129-134,136-151,153-173`; `apps/api/src/modules/partnerships/dto.ts:10`

**Evidence** (each line is a property that passes `whitelist`/`forbidNonWhitelisted` with any content of the declared outer type):
- `AdminEarnDto.items: Array<{sku,qty}>` — `@IsArray()` only, no `@ValidateNested`/`@Type` (contrast `QuoteDto.items` which has both). `qty` can be a string, negative or `1e308`; `evaluateEarn` does `s + (i.qty ?? 0)` then `qty * action.points`. `amountMinor` has `@Min(0)` but no `@Max`; `channel` is `@IsString` not `@IsIn`.
- `CreateReceiptDto.bonuses` — `@IsArray()` only; objects are later filtered in `receiptBonuses`, but the stored JSON keeps whatever was sent (`name` sliced to 80, `factor`/`points` any type).
- `CreateTierDto.multiplierBps` / `UpdateTierDto.multiplierBps` — `@IsInt` with no `@Min/@Max`: `-10000` or `10_000_000` accepted on the direct route too (negative multiplier → `Math.floor(base*multiplier)` negative → earn skipped; huge multiplier → brand liability inflates and the group wallet pays at settlement).
- `CreateCatalogItemDto.kind` / `UpdateCatalogItemDto.kind` — free string, used to pick `rewardPayload(kind, …)`.
- `IssueTerminalKeyDto.baseUrl` — free string embedded in the provisioning QR the till trusts as its API base (superadmin-only, but a typo'd `http://` goes straight to the device).
- `PlatformSettingsDto.settings`, `UpdateBrandDto.branding`, `UpdateSettingsDto.branding`, `UpdateTierDto.benefits`, `UpdatePartnerDto.connectorConfig` — `@IsObject()` JSON columns with no shape; `branding.logoUrl` is rendered on the receipt page (guarded by `^https://` and `esc`) and `website`/socials become `href`s (guarded by `socialUrl` prefixing). No size limit on these blobs beyond the 100 kB body cap.
- `InviteTeamDto.email` / `InviteMemberDto.email` — `@IsString` (service re-validates with a regex; superadmin `invitePlatformMember` does not — `superadmin.service.ts:67-90`).

**Impact**: Mostly self-inflicted misconfiguration by a brand or platform operator, plus a few type-confusion crashes (500s). No cross-tenant effect found.

**Fix (S):** Add `@ValidateNested({each:true}) @Type(() => …)` with `@ArrayMaxSize` on every array of objects; `@IsIn` on every field the Swagger decorator already calls an enum; `@Min/@Max` on multipliers, thresholds, reward points; a zod schema for `branding`/`settings`; `@IsUrl({protocols:['https'], require_protocol:true})` on `baseUrl`.

---

### API-12 — Error envelope leaks internal messages on some paths

- **Severity:** Low — **CVSS 3.1:** 3.7 `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Confidence:** Confirmed (code)
- **OWASP:** API8
- **Location:** `apps/api/src/platform-core/filters/all-exceptions.filter.ts:46-64`; `apps/api/src/modules/terminal-gateway/terminal.service.ts:829-840`; `apps/api/src/modules/workers/webhook.service.ts:148,217`

**Evidence**
- `AllExceptionsFilter` is correct for production (`'Internal server error'` when `NODE_ENV=production`, stack only logged). It does not map `LedgerError` (`idempotency_conflict`, `account_balance_non_negative`, …) to HTTP codes; only `insufficient_balance` is caught (`terminal.service.ts:728`, `loyalty.service.ts:933`), so an idempotency conflict surfaces as a generic 500 instead of 409 and clients retry.
- `batch()` returns `error: e.message` for each op to the terminal regardless of environment, so Prisma invocation text and ledger messages reach the till.
- Validation errors with `forbidNonWhitelisted` enumerate accepted property names (`property x should not exist`) — acceptable for a documented API; noted only.
- `testFire` and `webhookDelivery.lastError` return raw undici error strings to brand admins (used by API-02 as an oracle).

**Fix (S):** Map `LedgerError` codes to 409/422 in the filter; in `batch()` return the mapped error `code` rather than `message`; sanitise outbound-fetch errors to a fixed vocabulary.

---

### API-13 — Idempotency semantics: body keys, per-actor scope, terminal replay ignores payload, no expiry

- **Severity:** Low — **CVSS 3.1:** 3.1 `AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N`
- **Confidence:** Confirmed (code)
- **OWASP:** API6/API8
- **Location:** `packages/db/src/ledger/engine.ts:278-311`; `packages/db/prisma/schema.prisma:681-693`; `apps/api/src/modules/terminal-gateway/terminal.service.ts:641-647`; `apps/api/src/modules/loyalty-rules/loyalty.service.ts:897-916`; `apps/api/src/modules/superadmin/superadmin.service.ts:1206-1214`; `apps/api/src/modules/partnerships/conversion.service.ts:80-125`

**Evidence / status**
- Key is a body field `idempotencyKey` (no `Idempotency-Key` header support anywhere; `docs/00-research-notes.md` and `docs/01-architecture.md` describe a header, the developer portal describes the body field — the portal is what integrators read, so this is a docs drift, not a bug).
- Ledger level: unique `(actor_id, key)`, `requestHash` compared, mismatch → `LedgerError('idempotency_conflict')` → **500** (API-12), not 409. Stored `response` replayed. Keys never expire (table unbounded; fine but note for ops).
- Terminal level (`transaction()`): `terminal_transaction.actorId_idempotencyKey` is checked first and the existing row is returned **without** comparing the payload, so a till that reuses a key with a different cart silently gets the old transaction (no 409). Offline-replay friendly, but it hides POS bugs; the ledger's hash check never runs because the early return happens first.
- Conversion: `conversion.findFirst({ brandId, idempotencyKey })` — scoped per brand not per actor, so two customers of the same brand that pick the same key collide (returns the other customer's conversion object → minor cross-customer leak of `partnerPoints`/status). `ConvertDto.idempotencyKey` is `@IsString` with no length/format rule.
- Customer `redeem`: `(actorId=person, key)` — correct scope.

**Fix (S):** Scope conversion keys to `(membershipId, key)`; add `@Length(8,128)`/UUID format on all keys; compare a request hash on the terminal early-return path and return 409 `idempotency_conflict`; map the ledger error to 409; document a retention period and prune.

---

### API-14 — Unauthenticated `/metrics`, client-controlled `X-Request-Id`, diagnostics controllers in production

- **Severity:** Low — **CVSS 3.1:** 3.7 `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Confidence:** Confirmed (code)
- **OWASP:** API8, API9
- **Location:** `apps/api/src/platform-core/health/health.controller.ts:28-40`; `apps/api/src/app.module.ts:50-56`; `apps/api/src/auth/controllers/diagnostics.controller.ts`

**Evidence**
- `GET /metrics` (outside `/v1`, no guard, default throttle) returns `pid`, `node` version, RSS/heap and uptime. The doc comment says "production scrapes a Prometheus exporter behind this" — there is none.
- `genReqId` echoes an arbitrary client `x-request-id` into the response header and every log line with no length/charset check. Node rejects CR/LF in `setHeader` (the request then 500s inside the logger middleware), pino JSON-escapes the value, so this is noise/size only, but a 16 kB header per request is stored in logs verbatim.
- `/v1/admin/diagnostics/whoami` returns the full `TenantContext` (incl. `actor.onBehalfOf`, `elevated`) to any admin token; `/visible-brands` counts rows under RLS; `/terminal/diagnostics/ping` reveals the brand/actor binding of a key. All are documented in Swagger and shipped to production. Harmless individually; they are a free fingerprint of token claims.

**Fix (S):** Put `/metrics` behind a shared secret header or bind it to the private interface; cap `x-request-id` to 64 safe characters and otherwise generate one; drop or gate the diagnostics module with `NODE_ENV !== 'production'`.

---

### API-15 — Partner conversion idempotency collides across customers of one brand

Folded into API-13 (conversion scope). Listed here so the ID space matches the table above.

- **Severity:** Low — **CVSS 3.1:** 3.5 `AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N` — **Confidence:** Confirmed (code) — `conversion.service.ts:83`.

---

### API-16 — Inventory (API9): routes vs `openapi.json`, documentation gaps

- **Severity:** Info — **Confidence:** Confirmed (script diff, see Method)
- 270 handlers in code vs 262 operations in `apps/api/openapi.json`. The 8 missing are all deliberately `@ApiExcludeController`: `GET /r/{token}`, `GET /r/{token}/pdf`, the four PassKit web-service routes (`/devices/...`, `/passes/{passTypeId}/{serialNumber}`), `POST /log`, `GET /assets/logo.png`. Nothing in `openapi.json` is absent from code. CI's `git diff --exit-code -- apps/api/openapi.json` keeps the rest honest.
- Swagger UI is disabled in production unless `API_DOCS_ENABLED=true`; `.do/app.yaml` does not set it (good).
- The developer portal (`apps/docs`) documents idempotency and errors but has **no webhook-signature verification page**; the only consumer guidance ("verify on raw bytes, reject >5-min skew, dedupe on event_id") is internal (`docs/03-api-surface.md:524`). The web-brand console shows the header name only. Integrators will not know the timestamp tolerance or that secret rotation has no overlap window (`rotateSecret` replaces immediately).
- `GET /v1/manage/segments/fields` is the only handler under a `PermissionsGuard` controller without `@RequirePermissions` (static metadata; harmless).
- No deprecated/duplicate route families found; `/customer/auth/verify` (legacy per-brand sign-in) coexists with `/customer/auth/wallet` by design and is documented as legacy in the DTO.

---

### API-17 — Inbound integrations and outbound signing (API10)

- **Severity:** Info — **Confidence:** Confirmed (code)
- **Inbound webhooks:** none exist. There are no Twilio status callbacks, no Resend event webhooks, no Google Wallet callbacks, so nothing to verify. If they are added, the raw-body path (`rawBody: true`) is already in place for signature checks.
- **Apple PassKit web service** (`passkit-web.controller.ts`): `register`/`unregister`/`latest` check `Authorization: ApplePass <token>` with `timingSafeEqual` against a per-serial HMAC (`passkit.service.ts:46-52`). `GET /devices/{id}/registrations/{passTypeId}` carries no token by Apple's protocol; it returns serial numbers for a device-library id (an unguessable iOS identifier). `POST /v1/log` is an unauthenticated, throttle-exempt log sink capped at 20 lines × 300 chars per call — log-noise only.
- **Outbound webhooks:** HMAC-SHA256 over `${ts}.${body}` as `X-Loyalty-Signature: t=<unix>,v1=<hex>`, secret `whsec_` + 24 random bytes, envelope-encrypted at rest, returned once, rotatable; `X-Loyalty-Event-Id` for dedupe. Signature design is sound (timestamp bound, raw-body). Gaps: no receiver documentation (API-16), rotation has no grace period, `http://` allowed (API-02).
- **Partner connector:** stub only (`partner-connector.ts`). `UpdatePartnerDto.connectorConfig` is a free JSON blob stored encrypted; when a live connector arrives, its base URL/credentials will come from this superadmin-controlled field — apply the same SSRF allowlist as API-02 and never trust connector responses for ledger capture without the `partnerTxnRef`.
- **Twilio / Resend / Google OAuth:** fixed hostnames, bearer/basic auth from env, no response trust beyond status (`sms-sender.service.ts:144-176`, `email.service.ts:43-70`, `google-wallet.service.ts:151,184`).

---

### API-18 — Request body limits and transport hardening

- **Severity:** Info — **Confidence:** Confirmed (code)
- Body parser: Nest's default `express.json()` with `rawBody: true` — 100 kB limit, no override in `main.ts`. `BatchDto.operations` is `@ArrayMaxSize(200)` with nested validation. Adequate.
- helmet 8.2 defaults applied (HSTS, nosniff, frame-deny, API-level CSP that the receipt page overrides with its own stricter policy). No `X-Powered-By`.
- BigInt `toJSON` monkey-patch is global and safe.
- No HTTP method override middleware; Express 5 ignores `_method`.

---

## List endpoints and pagination caps

`≤N` = client `limit` validated with `@Max`; `fixed N` = hard-coded; `NONE` = returns every row the tenant can see (bounded only by tenant data size).

| Endpoint | Cap | Source |
|---|---|---|
| `GET /v1/manage/earn-rules`, `rewards`, `tiers`, `campaigns`, `badges`, `challenges` | ≤200 (default 100) | `ListQueryDto` + services |
| `GET /v1/manage/members` | ≤200 (default 50) | `loyalty.service.ts:511` |
| `GET /v1/manage/audit-logs` | ≤200 (default 50) | `loyalty.service.ts:623` |
| `GET /v1/manage/customers/:id/profile` / `export` | fixed 50 txns, 50 vouchers; badges/challenges NONE | `loyalty.service.ts:655-700` |
| `GET /v1/manage/coupons` | ≤200 (default 50) | `CouponQueryDto` |
| `GET /v1/manage/coupons/batches` | NONE (grouped) | `coupon.service.ts:100` |
| `GET /v1/manage/coupons/export.csv` | fixed 10,000 | `coupon.service.ts:164` |
| `GET /v1/manage/segments` | fixed 100 (no query wired) | `segment.service.ts:221` |
| `GET /v1/manage/segments/:id/members` | fixed 100 | `segment.service.ts:265` |
| `POST /v1/manage/segments/preview` | count + sample (bounded in SQL) | `segment.service.ts:195-200` |
| `GET /v1/manage/templates` | fixed 100 | `messaging.service.ts:45` |
| `GET /v1/manage/team`, `api-keys`, `webhooks` | NONE (small per-brand tables) | services |
| `GET /v1/manage/webhooks/deliveries` | fixed 50 (query `limit` not passed) | `webhook-admin.controller.ts:27` |
| `GET /v1/manage/change-requests` | ≤200 | `ChangeRequestQueryDto` |
| `GET /v1/manage/reports/rfm` | fixed 500 | `reporting.service.ts:71` |
| `GET /v1/manage/reports/rfm.csv` | fixed 10,000 | `reporting.service.ts:224` |
| `GET /v1/manage/reports/clv`, `visit-frequency`, `churn-risk` (+ `.csv`) | fixed top 20/20/25 + buckets | `analytics.service.ts` |
| `GET /v1/manage/reports/cohorts`, `liability-aging`, `by-branch`, `engagement`, `trend`, `by-type`, `summary` | aggregate, fixed windows (14 d / 6×6) | `reporting.service.ts`, `analytics.service.ts` |
| `GET /v1/manage/lulu/activity` / `topups` / `ledger` / `activity.csv` | fixed 50 / 50 / ≤500 / 5,000 | `partnership.service.ts:251,279,347,406` |
| `GET /v1/admin/groups`, `brands`, `brands-directory`, `team`, `brands/:id/branches`, `terminals`, `rewards`, `modules`, `partners`, `partners/:id/merchants` | NONE | `superadmin.service.ts`, `partnership.service.ts` |
| `GET /v1/admin/customers` | ≤200 (default 50) | `AdminListQueryDto` |
| `GET /v1/admin/customers/:personId` | fixed 25 txns / 60 vouchers; memberships NONE | `superadmin.service.ts:555,607` |
| `GET /v1/admin/vouchers` | ≤200 | `AdminListQueryDto` |
| `GET /v1/admin/audit-logs` | ≤200 | `superadmin.service.ts:1168` |
| `GET /v1/admin/groups/:id/wallet/ledger` | ≤200 | `AdminListQueryDto` |
| `GET /v1/admin/groups/:id/cost-rules` | fixed 20 | `superadmin.service.ts:1191` |
| `GET /v1/admin/search` | fixed 8 per entity | `superadmin.service.ts:1049-1054` |
| `GET /v1/admin/terminal-releases` | fixed 50 releases; terminals NONE | `superadmin.service.ts:1246-1251` |
| `GET /v1/admin/change-requests` | ≤200 | `ChangeRequestQueryDto` |
| `GET /v1/admin/partners/:id/conversions` / `conversions.csv` / `topup-requests` | fixed 100 / 5,000 / 200 | `partnership.service.ts:211,387,290` |
| `GET /v1/customer/transactions` | fixed 50 | `loyalty.service.ts:131` |
| `GET /v1/customer/rewards`, `badges`, `challenges`, `program`, `expiring` | NONE (per brand/member) | `loyalty.service.ts`, `gamification.service.ts` |
| `GET /v1/customer/leaderboard` | fixed 10 | `gamification.service.ts:359` |
| `GET /v1/customer/partners/conversions` | fixed 50 | `conversion.service.ts:74` |
| `GET /v1/customer/wallet/activity` | ≤200 (default 60, clamped in controller) | `wallet.controller.ts:42-45` |
| `GET /v1/customer/wallet/cards`, `vouchers`, `brands`, `offers`, `branch-visits`, `sessions` | NONE (person-bounded SECURITY DEFINER) | `wallet.service.ts` |
| `POST /v1/terminal/members/vouchers` | fixed 20 | `terminal.service.ts:472` |
| `GET /v1/terminal/transactions/:id` | single | — |

No list endpoint accepts an uncapped client `limit`; all `limit` DTOs carry `@Max(200)` or the service clamps. Offset pagination everywhere (no cursors); deep `offset` on `members`/`audit-logs` is a cost multiplier but bounded by the 200 page size.

## POST/PATCH/DELETE endpoints: throttle and idempotency

Default throttle = 300/min per `req.ip` (shared bucket per API-01). "Idem" = idempotency mechanism.

| Endpoint | Guard | Throttle | Idem |
|---|---|---|---|
| `POST /v1/auth/login`, `/mfa` | none | 10/min | n/a |
| `POST /v1/auth/token`, `/logout` | none | default | refresh rotation (02) |
| `POST /v1/auth/mfa/enrol`, `/confirm` | AdminJwt | default | n/a |
| `POST /v1/customer/auth/otp` | none | 5/min + 5/15 min per phone (SQL) | n/a |
| `POST /v1/customer/auth/verify` | none | 10/min + 5 attempts per code | n/a |
| `POST /v1/customer/auth/wallet`, `/refresh` | none | default + 5 attempts per code | n/a |
| `POST /v1/customer/rewards/:id/redeem` | CustomerJwt | default | body key, scope (person, key), hash-checked |
| `POST /v1/customer/vouchers/:code/redeem`, `/referral/redeem` | CustomerJwt | default | state machine (single use) |
| `POST /v1/customer/partners/link`, `/preview`, `/convert` | CustomerJwt | default | `convert`: body key scoped per **brand** (API-13) |
| `POST /v1/customer/wallet/brands/:id/join`, `/push-token`, `/deletion`; `PATCH profile/email/home-branch`; `DELETE sessions/:id`, `deletion` | WalletJwt | default | upsert semantics |
| `POST /v1/terminal/members/resolve`, `/enroll`, `/receipts`, `/members/vouchers`, `/vouchers/redeem`, `/members/context`, `/quotes` | HMAC | **none** (`@SkipThrottle`) | nonce (in-memory, per instance); receipts idempotent by client token |
| `POST /v1/terminal/transactions` | HMAC | none | body key, scope (terminal, key), **payload not compared** |
| `POST /v1/terminal/transactions/:id/capture`, `/void` | HMAC | none | state machine + ledger key `term:<key>:cap/void` |
| `POST /v1/terminal/transactions/batch` | HMAC | none; ≤200 ops | per-op as above |
| `POST/PATCH/DELETE /v1/manage/{earn-rules,rewards,tiers,campaigns,badges,challenges}` | AdminJwt + perms + Governance | default | none |
| `POST /v1/manage/customers/earn` | `brand.manage` | default | body key, scope (admin user, key) |
| `PATCH /v1/manage/customers/:id/profile`, `DELETE customers/:id`, `PATCH settings` | `brand.manage` | default | none |
| `POST /v1/manage/coupons/bulk-generate`, `/validate`, `/redeem`; `PATCH coupons/:id` | perms | default | none (bulk-generate is not idempotent) |
| `POST/PATCH/DELETE /v1/manage/segments*`, `templates*`, `team*`, `api-keys*`, `webhooks*` | perms | default | none |
| `POST /v1/manage/webhooks/:id/test` | `brand.manage` | default | none (outbound call per request, API-02) |
| `POST /v1/manage/change-requests`, `DELETE :id` | `brand.campaign.write` | default | none |
| `POST /v1/manage/reports/rollup`, `/rfm-snapshot` | `brand.report.read` | default | upsert (but full recompute each call, API-06) |
| `POST /v1/manage/lulu/topup-request` | `brand.manage` | default | none |
| `POST /v1/admin/groups`, `brands`, `branches`, `terminals`, `team/invite`, `terminal-releases`, `vouchers`, `vouchers/:id/cancel`, `terminals/:id/keys`, `keys/revoke`, `brands/:id/act-as`, `terminal-releases/:id/publish`; all `PATCH /v1/admin/*`; `DELETE branches/:id`, `terminals/:id`, `team/:id` | `platform.manage` | default | none |
| `POST /v1/admin/groups/:id/wallet/topup` | `group.wallet.manage` | default | body key, scope (admin user, key), hash-checked |
| `POST /v1/admin/groups/:id/cost-rule` | `group.wallet.manage` | default | none (new version row each call) |
| `POST /v1/admin/partners/*` (ensure, fund, threshold, merchants, topup invoice/confirm/reject) | `platform.manage` | default | state checks on topups; `fund` not idempotent |
| `PATCH /v1/admin/change-requests/:id/approve|reject`, `POST bulk-approve|bulk-reject` | `platform.manage` | default | status guard (`pending` only) |
| PassKit `POST/DELETE /v1/devices/...`, `POST /v1/log` | ApplePass token / none | **none** (`@SkipThrottle`) | upsert |

## Method

- Read every controller and DTO under `apps/api/src`, the services behind each write path, guards, filter, tenancy, workers, and the webhook/OTP/SMS/email senders.
- Verified library behaviour in `node_modules`: `@nestjs/throttler@6.5.0` `getTracker` → `req.ip`; `express@5.2.1` (trust proxy default off); `helmet@8.2.0`; Nest's platform-express body-parser registration (default 100 kB).
- Route inventory: a scratch script (`scratchpad/routes.js`, not committed) parsed `@Controller`/`@Get|Post|Patch|Delete` decorators and diffed against `apps/api/openapi.json` → 270 code handlers / 262 OpenAPI operations / 8 intentionally excluded / 0 phantom.
- Handler scan for permission-guarded controllers without `@RequirePermissions` → only `GET /manage/segments/fields` and the diagnostics routes.
- No network requests, no process started, no files outside `AUDIT/` written.

## Not assessed

- Live confirmation on DigitalOcean that the request peer address is the LB (API-01 is argued from code and DO's documented topology; one `GET /v1/admin/diagnostics/whoami` with logging of `req.ip` in staging would settle it).
- Whether `CORS_ORIGINS` / `API_DOCS_ENABLED` / `PUBLIC_API_URL` are set in the DO dashboard (not in `.do/app.yaml`).
- Login/MFA/refresh/JWT secrets and claim handling, per-tenant IDOR, act-as impersonation controls (agent 02).
- Ledger invariants, settlement math, voucher/points fraud at the business-rule level, referral/join bonus farming beyond the API controls noted (agent 04).
- RLS policy correctness, SECURITY DEFINER function bodies (`otp_issue`, `wallet_*`, `ereceipt_brand`, `terminal_enroll_person`), schema migrations (agent 09).
- Front-end token storage, deep links, mobile transport security (05/06).
- Dependency CVEs (no SCA was run; `pnpm audit` is not in CI).
- Fuzzing of the PassKit `.pkpass` builder, `sharp`/pdfkit resource behaviour under adversarial input (`pass-images.ts`, `receipt-public.controller.ts:47-113`).

## Positive controls verified

- Global `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })` on every direct route; every DTO property examined carries a decorator (no undecorated properties that would be stripped silently). Nested validation is correctly applied on `QuoteDto`/`TransactionDto`/`BatchDto`/`SetGovernanceDto`.
- No `...dto`/`...body` spread into Prisma `data:`; every update builds an explicit field map (`updateBrand`, `updateSettings`, `updateEndpoint`, `updateTier`, …). Branding JSON is merged, not replaced, on the brand route; status/enum fields are `@IsIn`-restricted on the direct routes.
- Sensitive columns are never returned raw: `secretEnc`/`secretHash`/`passwordHash`/`totpSecretEnc`/refresh hashes are excluded by explicit `select` everywhere they could appear (`api-key.service.ts`, `webhook.service.ts`, `team.service.ts`, `superadmin.service.ts`); secrets are shown once at creation. `listEndpoints` selects without `secretEnc`.
- Sort columns are allowlisted (`list.ts sortClause`, `listMembers sortCol` map); raw SQL uses tagged templates with parameters; the segment builder allowlists fields/operators and parameterises values.
- Every `limit` query is `@Max(200)`-capped or clamped server-side; batch replay capped at 200 operations; coupons at 10,000 per call.
- OTP: codes hashed at rest, 5-minute TTL, 5 verify attempts per code, 5 sends per number per 15 min, enforced in Postgres so it holds across replicas.
- Terminal HMAC: canonical string covers method, path, timestamp, nonce and raw body; 300 s skew; constant-time compare; revoked keys rejected; per-key secret envelope-encrypted.
- Terminal release URLs must be `https` and carry a mandatory SHA-256 the device verifies before install.
- Webhook signing: timestamped HMAC-SHA256 on raw body, per-endpoint secret encrypted at rest, event-id for dedupe, secret rotation endpoint.
- Apple pass link: 5-minute single-purpose JWT with `typ: apple_pass` check; PassKit web-service auth uses `timingSafeEqual`.
- Receipt page: strict CSP (`default-src 'none'`, no `script-src`, `form-action 'none'`, `base-uri 'none'`), `logoUrl` restricted to `https://`, colour values regex-validated, most fields HTML-escaped.
- Error envelope hides messages and stacks in production; Swagger off in production by default; helmet on; 100 kB body cap; pino redacts `authorization`/`cookie`/`x-api-key`.
- Team role assignment is allowlisted (`BRAND_ROLES`) so a brand admin cannot grant platform roles; superadmin `act-as` writes an `ImpersonationSession` and an audit row.
- Self-referral is rejected; referral codes are single-use; voucher codes carry 48 bits of entropy and are brand-checked before any state change.
