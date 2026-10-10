# 01 — Application Security (OWASP Top 10 / ASVS L2, L3 for auth + ledger paths)

Audit date: 2026-10-10. Branch `main` @ afc3fe2 plus uncommitted working tree. Read-only: no source edited, nothing run against production. Local verification limited to grep/read and a pure-computation Node script for APPSEC-02.

Scope covered: injection (Prisma raw SQL, command, template), XSS (receipt page, email HTML, PDF, docs portal, consoles), SSRF (webhooks, wallet integrations, SMS/email providers, asset fetch), deserialization and free-form JSON intake, file handling (APK releases, pass images, fonts, CSV export, PDF download), path traversal, insecure defaults (CORS, Swagger, helmet, error filter, throttling), secrets-in-URL transport.

Severity uses CVSS 3.1 base scores. Confidence: **Confirmed** = full path traced in code or reproduced locally; **Likely** = path traced but depends on a runtime/environment fact not verifiable from the repo; **Needs verification** = plausible, not traced end to end.

---

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 2 | APPSEC-01, APPSEC-02 |
| Medium | 5 | APPSEC-03, APPSEC-04, APPSEC-05, APPSEC-06, APPSEC-07 |
| Low | 5 | APPSEC-08, APPSEC-09, APPSEC-10, APPSEC-11, APPSEC-12 |
| Info | 3 | APPSEC-13, APPSEC-14, APPSEC-15 |

No SQL injection, command injection, path traversal, or script-executing XSS was found. The two High items are availability failures that a low-privilege actor can trigger platform-wide: a rate limiter that keys every client to the same proxy address, and a regex operator in the earn-rules engine that a brand admin can turn into an event-loop freeze. The Medium items are an unrestricted outbound webhook URL (SSRF), an elevated impersonation token carried in a URL, a stored HTML injection on the public e-receipt, missing security headers on both consoles, and a wide-open CORS default that the production spec never overrides.

---

## Findings

### APPSEC-01 — Rate limiter keys all clients to the load-balancer address (shared bucket → trivial lockout of login, OTP and MFA)

| | |
|---|---|
| Severity | **High** |
| CVSS 3.1 | 7.5 — `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` |
| Confidence | Likely (code path confirmed; depends on DigitalOcean App Platform forwarding through a proxy, which it does for all HTTP services) |
| Business impact | Outage: one unauthenticated client can lock every customer out of OTP sign-in and every operator out of console login, continuously, for the cost of 5 to 10 requests per minute. |
| Effort | S |

**Location**

- `apps/api/src/app.module.ts:41-43` and `:93` — `ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }])`, `providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]`
- `apps/api/src/main.ts:38-48` — Nest app created with Express; no `trust proxy` anywhere (`grep -rn "trust proxy\|getTracker\|x-forwarded-for" apps/api/src` returns nothing).
- `.do/app.yaml:7-22` — API runs as an App Platform HTTP service behind DO's router; `instance_count: 2`.
- Per-route overrides per `AUDIT/00_system_map.md §1`: login/MFA 10/min, OTP 5/min, verify 10/min.

**Evidence**

`@nestjs/throttler`'s default tracker is `req.ips.length ? req.ips[0] : req.ip`. Express only populates `req.ips` and derives `req.ip` from `X-Forwarded-For` when `trust proxy` is set; otherwise `req.ip` is the TCP peer, which behind App Platform's router is the router, not the client. The throttle storage is in-memory per instance (map §1).

**Exploit scenario**

1. From any IP, send `POST /v1/customer/auth/otp` six times in one minute with any valid-looking E.164 phone.
2. Every subsequent OTP request from every real customer hitting that instance receives 429 for the rest of the window. Repeat every minute. Two instances means two attackers' worth of requests, roughly 12 requests per minute, to hold both.
3. Same for `POST /v1/auth/login` (10/min) and the global 300/min bucket, which also caps all legitimate console and mobile traffic combined at 300 requests per minute per instance.

**Fix**

Set `app.set('trust proxy', 1)` on the Express adapter in `main.ts` (one hop: the App Platform router) **and** add a `ThrottlerGuard` subclass whose `getTracker` returns the first `X-Forwarded-For` hop so it cannot be spoofed by appending addresses. Confirm the hop count against DO's documented forwarding. Add an e2e test that two requests with different `X-Forwarded-For` values get separate buckets. Longer term, move throttle state to Valkey so the two instances share one view.

---

### APPSEC-02 — Earn-rule `matches` operator runs attacker-chosen regex on attacker-chosen input (ReDoS, event-loop freeze inside a ledger transaction)

| | |
|---|---|
| Severity | **High** |
| CVSS 3.1 | 6.8 — `AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:N/A:H` (rated High because the blast radius is every tenant on the instance and the freeze holds open DB transactions) |
| Confidence | Confirmed (reproduced locally against Node's regex engine with the exact call the engine makes; see numbers below) |
| Business impact | Outage and money-flow stall: a single brand admin can freeze both API instances for minutes to hours, with `earnWithTx` transactions held open, every till in the estate timing out, and offline outboxes growing. |
| Effort | S |

**Location**

- `packages/shared/src/rules.ts:14-27` — `ComparisonOp` includes `'matches'`.
- `packages/shared/src/rules.ts:66-100`:
  ```ts
  const MAX_REGEX_LEN = 200;
  ...
  case 'matches': {
    const pattern = String(value);
    if (pattern.length > MAX_REGEX_LEN) return false; // bound evaluation cost
    try {
      return new RegExp(pattern).test(String(actual));
  ```
  The length cap bounds the *pattern*, not the backtracking cost or the *subject*.
- Subject sources: `apps/api/src/modules/terminal-gateway/terminal.service.ts:604` — `evaluateEarn(rules, { session: {...}, items: dto.items })`; `apps/api/src/modules/loyalty-rules/loyalty.service.ts:257-259` — `items: input.items` then `evaluateEarn(rules, evalCtx)` inside the earn transaction.
- Subject length is unbounded: `apps/api/src/modules/terminal-gateway/dto.ts:91-95` — `CartItemDto.sku` is `@IsString()` only. `@MaxLength` appears in only three DTO files, none of them the cart item.

**Evidence (reproduced locally)**

The engine calls `new RegExp(userPattern).test(userSubject)` with no timeout and no safe-regex check. Timing Node's regex engine on the classic nested-quantifier pattern a brand admin can save as a rule condition, against a subject of a repeated character followed by one non-matching char (the shape `CartItemDto.sku` accepts):

| pattern | subject length | time |
|---|---|---|
| `^(a+)+$` | 23 | 25 ms |
| `^(a+)+$` | 25 | 104 ms |
| `^(a+)+$` | 27 | 417 ms |

Growth is roughly 4x per two characters, so a subject in the low 40s of characters crosses into minutes. The pattern itself is 7 characters, far under the 200-char cap. The subject arrives in `items[].sku`, which has no length limit, and the whole evaluation runs on the single Node event loop inside the earn DB transaction.

**Exploit scenario**

1. A brand admin (the lowest role that can author earn rules, per `AUDIT/00_system_map.md §3`) creates an earn rule whose condition uses `op: "matches"` with a nested-quantifier pattern. It passes `EarnRule.parse` (`loyalty.service.ts:297`) because the schema accepts any string.
2. Any terminal keyed to that brand posts a receipt or quote with one cart item whose `sku` is a long run of the matching character plus a mismatch. One request pins the event loop; the instance serves nothing else, including health checks, until it finishes.
3. Because earn evaluation happens inside `earnWithTx`, the DB transaction and its row locks stay open for the duration.

The same operator is reachable without even saving a rule, through campaign preview (`campaign.service.ts:55,77`) and earn-rule preview (`loyalty.service.ts:297,342`), which call `EarnRule.parse` on request input.

**Fix**

Do not run caller-supplied patterns on the main thread. Options, strongest first: drop the `matches` operator (no evidence any shipped rule uses it) and replace with `contains`/`startsWith`/`endsWith`; or compile patterns through a linear-time engine (`re2`) so backtracking is impossible; or, at minimum, cap `items[].sku` and every string attribute with `@MaxLength`, and run `test()` in a worker with a hard timeout. A pattern-length cap is not a fix — the demonstrated pattern is 7 characters.

---

### APPSEC-03 — Outbound webhook URL is unvalidated and unrestricted (SSRF into cloud metadata and internal services)

| | |
|---|---|
| Severity | **Medium** |
| CVSS 3.1 | 6.5 — `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N` |
| Confidence | Confirmed (path traced from DTO to `fetch`) |
| Business impact | Data leak: a brand admin can make the API issue server-side requests to `http://169.254.169.254/...`, internal Supabase/Valkey endpoints, or other RFC1918 hosts, with the response status observable via the test endpoint. |
| Effort | M |

**Location**

- `apps/api/src/modules/webhooks/dto.ts:4-13` — `RegisterWebhookDto.url` is `@IsString()` only; no `@IsUrl`, no scheme or host restriction. `UpdateWebhookDto.url` (`:16-20`) likewise.
- `apps/api/src/modules/workers/webhook.service.ts:138-150` — `testFire` does `this.fetchImpl(ep.url, { method: 'POST', ... })` and returns `{ ok, status }` to the caller synchronously.
- `apps/api/src/modules/workers/webhook.service.ts:202-206` — `deliverPending` fetches `d.endpoint.url` on the worker.
- Trigger: `apps/api/src/modules/webhooks/webhook-admin.controller.ts:37-67` — `POST /manage/webhooks` and `POST /manage/webhooks/:id/test` under `brand.manage`.

**Evidence**

```ts
// dto.ts
@IsString()
url!: string;
// webhook.service.ts testFire
const res = await this.fetchImpl(ep.url, { method: 'POST', headers: {...}, body });
return { ok: res.ok, status: res.status };
```

Nothing blocks `http://`, loopback, link-local, or private ranges, and `testFire` returns the reachability result to the caller, turning this into an interactive internal probe. Google Wallet/APNs/Resend/Twilio callers use literal provider hosts and are not affected; this is the only user-supplied fetch target.

**Exploit scenario**

1. Brand admin registers an endpoint with `url = http://169.254.169.254/metadata/...` (or an internal hostname).
2. Calls `POST /manage/webhooks/:id/test`. The response body discloses whether the internal host answered and with what status. Iterate to map internal services.

**Fix**

Validate at the DTO with `@IsUrl({ require_protocol: true, protocols: ['https'] })`, then at fetch time resolve the host and reject loopback, link-local (169.254/16, fd00::/8), and RFC1918 ranges, re-checking after DNS resolution to defeat rebinding (or pin to the resolved IP). Consider an allowlist of registrable domains per brand. Do not return raw upstream status from `testFire` for non-public targets.

---

### APPSEC-04 — Elevated impersonation token delivered in a URL query string (token leak via history, logs, referrer)

| | |
|---|---|
| Severity | **Medium** |
| CVSS 3.1 | 6.5 — `AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:N` |
| Confidence | Confirmed |
| Business impact | Takeover of a brand tenant: the superadmin "Manage as brand" token grants a governance-lock-bypassing (`elevated: true`) brand_admin session and travels somewhere it is routinely captured. |
| Effort | M |

**Location**

- `apps/web-superadmin/lib/api.ts:409` — `window.open(\`${BRAND_CONSOLE_URL}/act?token=${encodeURIComponent(token)}\`, '_blank', 'noopener')`
- `apps/web-brand/app/act/page.tsx:10-17` — reads `new URLSearchParams(window.location.search).get('token')`, calls `setToken(token)`, then `router.replace('/')`.
- Token contents: `apps/api/src/modules/superadmin/superadmin.service.ts:124-139` — `issueAccess({ ..., roles: ['brand_admin'], elevated: true, onBehalfOf })`. Access TTL is 900s (§3).

**Evidence**

The access token is placed in the target URL's query. Query strings are written to browser history, can appear in `Referer`, and are the most commonly logged part of a request. `setToken` then stores it in `localStorage['rfm_token']` (`apps/web-brand/lib/api.ts:8`), readable by any script in the brand console origin.

**Exploit scenario**

A superadmin opens "Manage as brand". For 15 minutes the URL carrying an elevated brand token sits in history and may be emitted as a referrer. Anyone who captures it replays it as a full brand_admin that bypasses governance locks.

**Fix**

Hand the token off out of band: POST it to the brand console's `/act`, or carry it in the URL fragment (`#token=`, never sent to servers or referrers), or mint a single-use short-TTL exchange code that `/act` swaps for the real token over a POST. Shorten the act-as token TTL below 900s and bind it to the `ImpersonationSession` for revocation.

---

### APPSEC-05 — Stored HTML/URL injection on the public e-receipt via brand profile fields

| | |
|---|---|
| Severity | **Medium** |
| CVSS 3.1 | 5.4 — `AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N` |
| Confidence | Confirmed (unescaped sink traced; script execution blocked by CSP, URL-scheme injection not blocked) |
| Business impact | A brand admin can plant attacker-controlled links and off-site image beacons on a public, unauthenticated page served from the API's own origin, shown to that brand's customers. |
| Effort | S |

**Location**

- `apps/api/src/modules/terminal-gateway/receipt-public.controller.ts:454-466` — social links built from `brand.website/instagram/facebook/tiktok/x`:
  ```ts
  const socialLink = (href, icon, label) => `<a href="${esc(href)}" target="_blank" rel="noopener">...`;
  if (brand.website) socials.push(socialLink(socialUrl('https://', brand.website), ...));
  ```
- `receipt-public.controller.ts:490` (`socialUrl`): `return /^https?:\/\//i.test(s) ? s : \`${base}${s}\`;` — if the stored value already starts with `http:`/`https:` it is used verbatim; `esc()` escapes HTML metacharacters but not the URL scheme/structure.
- Brand profile is attacker-writable: `apps/api/src/modules/loyalty-rules/loyalty.service.ts:596-607` (`updateSettings` merges `dto.branding`), DTO `apps/api/src/modules/loyalty-rules/dto.ts:436-438` — `branding?: Record<string, unknown>` with `@IsObject()` only. Rendered through `ereceipt_brand` (`packages/db/prisma/sql/2026-07-28_ereceipt_brand.sql:8-11`).

**Evidence**

`esc` (`receipt-public.controller.ts:119-120`) encodes `& < > " '`, which stops tag breakout, so the logo `<img src="${esc(brand.logoUrl)}">` is only rendered when it matches `/^https:\/\//` (`:356-358`). But `website` only requires a leading `http(s)` for the verbatim branch, so a stored value such as `https://evil.example/@victim` is placed in `href` as-is. The page CSP (`:200-209`) sets `script-src` to nothing and `default-src 'none'`, so injected `<script>` is inert, which caps this at Medium; `img-src https:` still allows off-site image beacons via `logoUrl`.

**Exploit scenario**

A brand admin sets `branding.website` (or another social field) to an attacker URL. Every customer who opens that brand's e-receipt sees a link, on the `api.partnerspoints.ae` origin, pointing where the attacker chose; `img-src https:` also permits a tracking pixel. No console XSS results because the CSP blocks scripts, but trust-origin phishing and beaconing remain.

**Fix**

Validate brand profile fields server-side: `website` must parse as `https:` with a real host; social fields must match a handle charset `[A-Za-z0-9._-]`. In `socialUrl`, always build from the known base and a sanitized handle rather than trusting a stored absolute URL.

---

### APPSEC-06 — Consoles ship no security headers; brand/superadmin tokens live in localStorage

| | |
|---|---|
| Severity | **Medium** |
| CVSS 3.1 | 6.1 — `AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N` |
| Confidence | Confirmed |
| Business impact | Any script injection or dependency compromise in either console reads the session token directly (no HttpOnly protection), and the absence of CSP/frame protection widens clickjacking and injection impact on the money-control plane. |
| Effort | M |

**Location**

- `apps/web-brand/next.config.mjs` and `apps/web-superadmin/next.config.mjs` — no `headers()`, no CSP, no `X-Frame-Options`; both set `eslint: { ignoreDuringBuilds: true }`. (The docs portal, `apps/docs/next.config.*`, does set `X-Frame-Options: DENY`, nosniff, noindex — see Positive controls.)
- `apps/web-brand/lib/api.ts:5-12` — token in `localStorage['rfm_token']`; `apps/web-superadmin/lib/api.ts` — `localStorage['rfm_sa_token']` (§6).
- No `middleware.ts` in either console (§6).

**Evidence**

Neither console emits a Content-Security-Policy, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, or `Referrer-Policy`. The bearer token is in `localStorage`, reachable by any JavaScript in the origin; combined with no CSP, a single injected or compromised script exfiltrates a live brand_admin or superadmin token.

**Fix**

Add a `headers()` block to both configs with a strict CSP (`default-src 'self'`, explicit script/connect origins for the API), `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, mirroring the docs portal. Prefer moving the session to an HttpOnly, Secure, SameSite cookie; if localStorage stays, the CSP is the main compensating control. Re-enable lint in CI.

---

### APPSEC-07 — CORS reflects any origin with credentials when `CORS_ORIGINS` is unset, and the production spec never sets it

| | |
|---|---|
| Severity | **Medium** |
| CVSS 3.1 | 5.3 — `AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:L/A:N` |
| Confidence | Likely (code confirmed; production harm depends on `CORS_ORIGINS` being left unset, and `.do/app.yaml` does not set it) |
| Business impact | If `CORS_ORIGINS` is unset in production, any website can make credentialed cross-origin calls and read responses. |
| Effort | S |

**Location**

- `apps/api/src/main.ts:44-48`:
  ```ts
  const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map(s=>s.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true });
  ```
- `.do/app.yaml:23-54` — the API service `envs` list has no `CORS_ORIGINS` entry.

**Evidence**

`origin: true` reflects the request's `Origin` and returns `Access-Control-Allow-Credentials: true`. The production spec never provides `CORS_ORIGINS`, so unless it is set by hand in the DO dashboard the API ships reflect-any-origin-with-credentials. The consoles use bearer tokens rather than cookies, which narrows but does not eliminate exposure (any future cookie use, or a header-reading endpoint called with credentials, is exposed).

**Fix**

Make the origin list mandatory in production: fail startup if `NODE_ENV === 'production'` and `CORS_ORIGINS` is empty, and add `CORS_ORIGINS` to `.do/app.yaml` with the two console origins. Never pair `origin: true` with `credentials: true`.

---

### APPSEC-08 — e-receipt / PDF endpoints are unauthenticated with no `Cache-Control` and no per-token rate limit

| | |
|---|---|
| Severity | **Low** |
| CVSS 3.1 | 4.3 — `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N` |
| Confidence | Confirmed |
| Business impact | Receipt contents (member name, order, points balance, masked PAN) are protected only by an unguessable token and may be retained by shared caches; no tight throttle on a public PII endpoint. |
| Effort | S |

**Location**

- `apps/api/src/modules/terminal-gateway/receipt-public.controller.ts:21-44` (`GET /r/:token`) and the PDF route — no guard; token is a client-generated UUIDv4 (`dto.ts:45-48`, `CheckoutViewModel.kt:421` `UUID.randomUUID()`).
- No `Cache-Control` header is set on the HTML; the PDF route sets only `Content-Disposition`.

**Evidence**

The capability model (unguessable UUIDv4 token) is reasonable and entropy is adequate. The gaps are a missing `Cache-Control: private, no-store` on a page that returns personal data, and no per-token/IP throttle beyond the global 300/min.

**Fix**

Add `Cache-Control: private, no-store` to both responses, add a modest per-IP throttle on `/r/*`, and consider expiring tokens after a retention window.

---

### APPSEC-09 — Swagger exposure and `/metrics` depend solely on env discipline

| | |
|---|---|
| Severity | **Low** |
| CVSS 3.1 | 5.3 — `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N` |
| Confidence | Confirmed |
| Business impact | If `API_DOCS_ENABLED=true` is ever set in production, the full control-plane route map is served unauthenticated at `/docs`. `/metrics` is always public and leaks process internals. |
| Effort | S |

**Location**

- `apps/api/src/main.ts:66-71` — docs mounted when `NODE_ENV !== 'production'` **or** `API_DOCS_ENABLED === 'true'`, with no auth.
- `apps/api/src/platform-core/health/health.controller.ts:31-42` — `GET /metrics` returns `rssBytes`, `heapUsedBytes`, `node` version, `pid`, uptime, unguarded and outside the `/v1` prefix.

**Evidence**

Default-off Swagger is good but a single env var from exposing the whole API surface unauthenticated. `/metrics` discloses the Node version (useful for CVE targeting) and pid to anyone.

**Fix**

Put `/docs` and `/metrics` behind an auth check or network allowlist even when enabled. Drop `node`/`pid` from the public metrics payload.

---

### APPSEC-10 — Free-form JSON columns accepted with `@IsObject()` only (no shape/size validation on stored blobs)

| | |
|---|---|
| Severity | **Low** |
| CVSS 3.1 | 4.3 — `AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:L` |
| Confidence | Confirmed |
| Business impact | Operators can store arbitrarily large / arbitrarily shaped JSON into `branding`, `settings`, `definition`, `benefits`, `connectorConfig`; downstream readers trust fields by casting, and oversized blobs are a cheap storage lever. |
| Effort | M |

**Location**

- `apps/api/src/modules/loyalty-rules/dto.ts:28,97,221,278,305,438`; `apps/api/src/modules/segments/dto.ts:17,34,40`; `apps/api/src/modules/superadmin/dto.ts:150,172`; `apps/api/src/modules/governance/dto.ts:22`; `apps/api/src/modules/partnerships/dto.ts:10` — all `@IsObject()` with no nested schema.
- Readers cast rather than validate, e.g. `terminal.service.ts:298` `const branding = (brand?.branding ?? {}) as { primaryColor?: string }`, and the e-receipt `BrandProfile` cast (`receipt-public.controller.ts:40`).

**Evidence**

`forbidNonWhitelisted` strips unknown top-level DTO keys but does not reach inside an `@IsObject()` blob; the nested structure is persisted unchecked. `SegmentService` and the rules engine do validate their definitions structurally before use (good — see Positive controls), but `branding`/`settings`/`benefits`/`connectorConfig` are consumed by field-casting with no size or depth bound.

**Fix**

Give each JSON column a zod schema and parse it before persist; cap serialized size. This also closes the write side of APPSEC-05.

---

### APPSEC-11 — Verbose error messages returned to clients outside production

| | |
|---|---|
| Severity | **Low** |
| CVSS 3.1 | 3.1 — `AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N` |
| Confidence | Confirmed |
| Business impact | In any non-production environment, raw exception messages (including DB/driver detail) are returned to the caller. Safe in prod; a risk for an internet-reachable staging/preview. |
| Effort | S |

**Location**

- `apps/api/src/platform-core/filters/all-exceptions.filter.ts:58-60` — `message = process.env.NODE_ENV === 'production' ? 'Internal server error' : exception.message;`

**Evidence**

The production branch is correctly generic. The else branch returns the raw `exception.message` to the client for every non-`HttpException` error, so any exposed staging deployment leaks internals. Full detail already goes to the pino log (`:60`).

**Fix**

Gate verbose messages on an explicit debug flag rather than "not production", so previews default to generic errors.

---

### APPSEC-12 — `r.kind` interpolated into receipt HTML without escaping; receipt fields have no length bounds

| | |
|---|---|
| Severity | **Low** |
| CVSS 3.1 | 3.7 — `AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N` |
| Confidence | Confirmed |
| Business impact | A terminal (or upstream caller able to set receipt fields) can store very long or odd `orderNo`/`memberName`/`kind` values; `r.kind` is interpolated into the receipt HTML without `esc()`, inconsistent with every neighbouring field. |
| Effort | S |

**Location**

- `apps/api/src/modules/terminal-gateway/receipt-public.controller.ts:374` — `...${r.kind.toUpperCase()}...` with no `esc()`.
- `apps/api/src/modules/terminal-gateway/dto.ts:50-70` — receipt string fields are `@IsString()`/`@IsOptional()` with no `@MaxLength`; `kind` is a free `@IsString()` (the `enum` is documentation only), persisted at `terminal.service.ts:376`.

**Evidence**

Every other interpolated field uses `esc(...)`; `r.kind` does not. CSP blocks scripts and the value is upper-cased, so breakout is unlikely, but the inconsistency is a latent injection and no receipt field has a length cap.

**Fix**

Wrap `r.kind` in `esc()`, enforce the enum with `@IsIn(['sale','refund','void'])`, and add `@MaxLength` to receipt string fields.

---

## Positive controls verified

- **Parameterised SQL throughout.** The one `$queryRawUnsafe` (`apps/api/src/modules/customer-wallet/wallet.service.ts:30-39`) builds only positional `$n` placeholders and passes values as bind args; it never concatenates input. The ledger's one `$executeRawUnsafe` (`packages/db/src/ledger/engine.ts:139-144`) interpolates only a column name chosen from a hardcoded `'posted_debits'|'posted_credits'` literal, with amount and account id bound.
- **Raw-SQL identifier interpolation is from fixed allowlists.** `loyalty.service.ts:514,530` uses `Prisma.raw` only for `sortCol`/`orderDir` from a static map and an `asc|desc` check; `segments/segment.service.ts` `Prisma.raw(col)` comes only from `FIELD_COL`, operators from `OP_SQL`, values always bound. No user string reaches `Prisma.raw`.
- **SECURITY DEFINER functions pin `search_path = public`** across all wallet/receipt/terminal/txn-alert helpers (confirmed on `2026-07-28_customer_wallet.sql`, `ereceipt_brand`, `person_access_and_receipts`, `rls.sql`), and take ids rather than a caller-supplied tenant.
- **CSV export is injection-safe.** `apps/api/src/platform-core/csv.ts:29-34` prefixes `= + - @` leads with `'` and RFC-4180-quotes commas/quotes/newlines.
- **Email and PDF templates escape interpolated data.** `apps/api/src/platform-core/email/email.templates.ts` runs brand name, member name, order, voucher codes, reward names, labels and button href/label through `esc(...)`; the PDF (`receipt-public.controller.ts`) draws values as PDFKit text, not markup, and validates `primaryColor` against `/^#[0-9a-fA-F]{6}$/`.
- **Terminal APK update verifies SHA-256 before install.** `AppUpdater.kt:73-85` re-hashes the download and refuses on mismatch; the server rejects non-`https` release URLs and malformed digests (`superadmin.service.ts:1290-1294`).
- **Rules and segment definitions are structurally validated** before evaluation/use (`EarnRule.parse` at every write/preview; `SegmentService.whereClause` rejects unknown fields/ops). The `matches` operator (APPSEC-02) is the one unsafe element inside an otherwise validated engine.
- **PassKit auth uses constant-time comparison** with a length pre-check (`passkit.service.ts:46-52`), and HMAC verification runs over the raw body with single-use nonces (`terminal-hmac.guard.ts:67-78`).
- **Docs portal has real headers and auth**: `X-Frame-Options: DENY`, nosniff, noindex (`apps/docs/next.config.*`), HMAC-signed expiring session cookie, constant-time code comparison, and `safeNextPath` open-redirect guard (`apps/docs/lib/auth.ts:66-108`).
- **Pino redacts** `authorization`, `cookie`, `x-api-key` (`app.module.ts:58`); no OTP/password values are logged.

---

## Not assessed (and access needed)

- **Runtime CORS / Swagger values in the live DO environment.** APPSEC-07 and APPSEC-09 hinge on whether `CORS_ORIGINS` is set and `API_DOCS_ENABLED` is unset in the DO dashboard; the repo cannot show this. Needs read access to the DO app's env.
- **Dependency CVEs (SCA).** CI has no SCA step (§1). Versions were listed (`helmet 8.2.0`, `express 5.2.1`, `next 15.5.19`, `@prisma/client 6.19.3`, `marked 15.0.12`, `pdfkit 0.19.1`, `jsonwebtoken 9.0.3`) but not checked against an advisory DB. Recommend `pnpm audit`/`osv-scanner` in CI.
- **APPSEC-02 end-to-end through the HTTP stack.** The ReDoS was proven against the exact engine call locally; it was not driven through a running API to confirm the earn transaction holds locks for the full duration (rules forbid prod; a local run is feasible but not performed this pass).
- **class-transformer `@Type` nested-DTO coverage.** Only `terminal-gateway/dto.ts` uses `@ValidateNested`/`@Type`; I did not enumerate every controller for DTOs accepting nested objects without it (mass-assignment is agent 03's domain; flagged here only as APPSEC-10's shape gap).
- **Mobile/terminal client-side storage and deep-link handling** — owned by agent 05; not assessed beyond the APK update path.