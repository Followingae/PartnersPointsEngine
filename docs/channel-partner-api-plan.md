# Channel Partner API — Plan (Till integration)

**Status:** approved 2026-09-23 with the decisions in §6 · no engine code written yet
(the developer portal in §3.8 is live, see `apps/docs`)

## 1. What we are solving

Till is a restaurant POS. Its restaurants should be able to switch on Partners
Points loyalty **inside Till**, and process earn / redeem / rewards from the Till
register, without RFM staff creating anything by hand.

Boundaries agreed on 2026-09-23:

- A restaurant can enable loyalty only if **Till has enabled it for them**.
- **Governance stays at Partners Points superadmin.** Till gets no governance.
  Superadmin sees and controls every merchant, location and register Till creates.
- Merchants **still get the Partners Points brand portal** (earn rules, rewards,
  campaigns, reporting). Only the register-level work moves from our terminal
  Android app into the Till app.
- The 14 terminal endpoints in `docs/pos-integration-api.md` stay the contract for
  taking a sale. Nothing changes in their request or response bodies.

What we have today is per-terminal HMAC keys issued by hand from the superadmin
console. That is the right model for our own payment terminals. It is the wrong
model for a software partner with hundreds of restaurants.

## 2. How the industry does this

Every POS and loyalty platform with a partner ecosystem has converged on the same
shape. We are not inventing anything.

| Platform | Partner credential | How a merchant is selected | How merchants are linked | Sandbox |
|---|---|---|---|---|
| Toast Partner API | OAuth2 client credentials → JWT with scopes | `Toast-Restaurant-External-ID` header per request | Restaurant enables the partner in Toast Web; partner is notified by webhook and can list `/restaurants` | Sandbox environment |
| Stripe Connect | Platform secret key | `Stripe-Account: acct_…` header per request | Platform creates connected accounts by API, or merchant authorizes via OAuth | Test mode keys |
| Square | OAuth2 per seller (app marketplace) | Token is seller-scoped | Seller authorizes the app; scopes limit access | Separate sandbox host |
| Clover | OAuth2 per merchant (app market) | `merchantId` in path | Merchant installs the app | Test merchants |
| Punchh (PAR) | Business key + location key in one header | Location key selects the location | Keys generated in the Punchh dashboard | Certification programme |

Two patterns fall out:

1. **Marketplace pattern** (Square, Clover, Toast): the merchant already has an
   account with the platform and *authorizes* the partner. Good when merchants
   sign up with the platform first.
2. **Platform pattern** (Stripe Connect, Toast provisioning, Punchh): the partner
   *creates* the merchant through the API and acts on its behalf with one
   credential plus a "which merchant" header.

Till's case is the platform pattern. The restaurant's relationship is with Till,
Till enables loyalty, and the merchant must exist in Partners Points the moment
Till turns it on. So Till provisions, and we govern.

## 3. Proposed model

Introduce a **Channel** (a software partner that brings merchants). Till is the
first channel. The word "Partner" is already taken in our schema by the Lulu
open-loop partnership, so this is deliberately named Channel to avoid collision.

```
Platform (RFM)
 └─ Channel: Till                     ← one credential, one webhook, one sandbox
     └─ Group "Till · <restaurant>"   ← created by Till, owned by the merchant
         └─ Brand                     ← merchant portal, governance, modules
             └─ Branch (location)     ← created by Till
                 └─ Terminal (register) ← created by Till, no secret needed
```

Everything Till creates is a normal Group / Brand / Branch / Terminal with a
`channelId` and an `externalRef` (Till's own id). Superadmin sees them exactly as
it sees everything else, plus a Channels page that shows them grouped by channel.

### 3.1 Authentication

- Till receives **OAuth2 client credentials** (`client_id`, `client_secret`) from
  us, one pair per environment. This matches Toast and Clover and matches our
  in-house auth decision (2026-06-13). No third-party IdP.
- `POST /v1/channel/auth/token` with `grant_type=client_credentials` returns a
  short-lived JWT (15 min) carrying `channelId` and scopes.
- Scopes: `merchants:write`, `merchants:read`, `registers:transact`,
  `webhooks:manage`. We issue Till all four; scopes exist so a future channel can
  be given less.
- Every transactional call carries `PP-Register: <registerId>` (Toast and Stripe
  header pattern). The guard resolves platform, group, brand, branch and terminal
  from the register and builds the same tenant context the HMAC guard builds
  today. The terminal service does not change.
- HMAC per-register keys **stay available** through the channel API for the case
  where Till devices call us directly instead of through the Till backend. See
  §3.5.

### 3.2 Provisioning endpoints (`/v1/channel/*`)

All idempotent on `externalRef`. Re-sending the same merchant returns the
existing record, never a duplicate.

| Endpoint | Creates | Notes |
|---|---|---|
| `POST /channel/merchants` | Group + Brand | `externalRef`, `name`, `currency`, `pointsCurrencyCode`, `ownerEmail`, `ownerName`. Sends the brand-portal invite to `ownerEmail`. |
| `GET /channel/merchants`, `GET /channel/merchants/{id}` | | Includes `status` so Till can show "suspended by Partners Points" honestly. |
| `POST /channel/merchants/{id}/locations` | Branch | `externalRef`, `name`, `timezone`. |
| `POST /channel/locations/{id}/registers` | Terminal | `externalRef`, `label`. Returns `registerId` for the header. |
| `PATCH` on each, and `POST …/deactivate` | | Till can rename or deactivate what it created. Till cannot suspend, delete, or change governance. |
| `POST /channel/registers/{id}/keys` | HMAC key | Only for device-direct deployments. Same shape as today's key issuance. |
| `GET /channel/merchants/{id}/config` | | The same payload as `GET /terminal/config`, so Till can render points names and redemption rates in its own settings UI. |

**Merchant creation requires superadmin approval** (decided 2026-09-23). A new
merchant lands as a `ChangeRequest` of type `channel.merchant.create` in
`pending` status; the Group, Brand and portal invite are created on approval.
Till sees `status: "pending_approval"` on the merchant until then and its
registers get `403 merchant_pending` on transactional calls, with a message safe
to show the restaurant ("Loyalty is being activated by Partners Points").

Every new request also **emails the superadmin approvals address**
(`CHANNEL_APPROVAL_NOTIFY_EMAIL`, set to `zain.ali@rfmloyaltyco.ae`) with the
merchant name, channel, locations, owner contact and a one-click link to the
change request in the superadmin console. Approval and rejection are audited and
pushed to Till as `merchant.activated` / `merchant.rejected` webhooks.

### 3.3 Transactions

The Till backend calls the existing terminal endpoints with the channel bearer
token and the `PP-Register` header:

```
POST /v1/terminal/transactions
Authorization: Bearer <channel JWT>
PP-Register: 019fc7…
{ "intent": "earn", "memberToken": "…", "idempotencyKey": "…", "amountMinor": 2450, "isVisit": true }
```

Same bodies, same responses, same idempotency, same authorize / capture / void
state machine, same offline batch. The POS integration doc gains a short
"Authenticating as a channel" section and otherwise stands.

Two things Till will ask for on day one that the terminal API does not do, and
which this plan adds because restaurants need them:

- **Partial refund of a captured sale** (`POST /terminal/transactions/{id}/refund`
  with `amountMinor`): claws back earned points pro rata, and returns redeemed
  points pro rata. RetailClub has this today as `ReturnCheckOut`; we do not.
  **Semantics (decided 2026-09-23):** the clawback is posted in full even when
  the member has already spent the points, so a balance **may go negative** and
  is netted against future earns. A refund never reverses a completed stamp,
  tier or challenge. Reasoning: flooring at zero makes "earn, redeem, refund"
  a free-points loop; a negative balance is honest accounting and the ledger
  is double-entry already. The customer app shows a negative balance as zero
  available with a "points pending recovery" note; the brand portal shows the
  true figure.
- **`cashierRef` on transactions**: an opaque string Till supplies so reports can
  be cut by server. Stored, never validated by us.

### 3.4 Governance and visibility (superadmin only)

- **Channels page** in the superadmin console: each channel, its credentials
  status, merchant / location / register counts, 24 h call volume and error rate,
  webhook health.
- **Per-channel kill switch**: suspending a channel rejects every call with its
  credential within seconds. Suspending a merchant rejects only that merchant.
- Everything Till creates is labelled "via Till" on the existing Brands and
  Locations pages. Nothing is hidden in a separate world.
- **Brand governance is unchanged.** The merchant's portal edits still go through
  `governanceMode` (approval required by default). Module entitlements are still
  superadmin-controlled. Till has no endpoint that touches either.
- **Audit**: every channel call is recorded with actor `{ type: 'channel', id }`,
  so a register-level transaction and a merchant creation are both attributable
  to Till in the audit log.
- **Rate limits** per channel, not per IP, since Till's whole fleet arrives from
  one backend.

### 3.5 Deployment shapes Till may have

We do not yet know Till's architecture. The plan supports both:

- **Till backend calls us** (recommended). One credential, register in a header,
  no secrets on devices. This is what Toast, Stripe and Square partners do.
- **Till devices call us directly.** Then each register needs its own HMAC key,
  issued by Till's backend through `POST /channel/registers/{id}/keys` at
  device activation and pushed to the device by Till. Our existing terminal
  guard handles the calls unchanged.

The first question to ask Till is which of these they are.

### 3.6 Webhooks

Till registers **one channel-level webhook endpoint** and receives events for all
its merchants, each event carrying `merchantExternalRef` and `registerExternalRef`.
This reuses the existing outbox and delivery worker with a new subscription scope.

New event types: `merchant.activated`, `merchant.suspended`,
`merchant.config.changed` (redemption rates, points name), `reward.published`,
`channel.suspended`. Existing brand-level events (earn, redeem.captured,
tier.changed, challenge.completed…) are also deliverable at channel level so Till
can show loyalty activity in its own reporting if it wants.

### 3.7 Sandbox

Till needs to build and test without touching real balances. Options:

| Option | Cost to us | Fidelity | Isolation |
|---|---|---|---|
| **Test-mode credentials on production** (Stripe pattern): a second client_id whose merchants are flagged `isTest` and excluded from reporting, wallet billing and messaging | Low: one flag, a few filters | Exact | Data shares a database, guarded by the flag and RLS |
| Separate staging deployment | High: second DO app, second Supabase project, ongoing drift | Drifts from prod | Complete |

**Decided 2026-09-23: test-mode credentials.** It is what Till's developers
already know from Stripe and it costs a day, not an environment.

### 3.8 Developer docs

Superadmin Swagger stays off. **Live since 2026-09-23** as `apps/docs`, a
Next.js app deployed on Vercel (`developers.partnerspoints.ae`):

- Content lives in `apps/docs/content/` (guide markdown plus a typed endpoint
  reference), so a doc change is a deploy, not a copy-paste.
- Gated by **per-partner access codes** (`DOCS_ACCESS_CODES=till=…,acme=…`)
  behind a signed, expiring session cookie. Revoking a partner is deleting its
  entry. Every response carries `noindex`; robots are disallowed.
- Serves the **terminal-scoped OpenAPI 3 document** at `/openapi.json`, cut from
  the API's full export (terminal paths and their schemas only), so Till can
  generate a client.
- Follow-up: when the channel API ships, the portal gains a channel guide and
  the access code is replaced by the channel's own client credentials.

## 4. What exists already, and what is new

Already in the codebase and reused as is:

- Tenant hierarchy, RLS, `TenantContext`, terminal service, all 14 terminal
  endpoints, idempotency, authorize / capture / void, batch, receipts.
- `ApiKey` model (terminal keys and brand integration keys), HMAC guard, key
  issuance with secret-shown-once.
- Webhook endpoints, outbox, signed delivery with retries.
- Governance: `governanceMode`, change requests, module entitlements, audit log.
- Brand team invite (`/manage/team/invite`), used to give the merchant owner their
  portal login.
- Superadmin console pages for brands, locations and terminals.

New:

- `Channel` model with encrypted client secret, scopes, status, webhook endpoint,
  `newMerchantsRequireApproval`, `isTest` twin.
- `channelId` and `externalRef` on Group, Brand, Branch, Terminal.
- `/v1/channel/*` module: token endpoint, provisioning, config read, key issuance.
- Channel JWT guard for `/v1/terminal/*` alongside the HMAC guard, plus the
  `PP-Register` header resolver.
- Refund endpoint and `cashierRef` on the terminal API.
- Channel-level webhook subscriptions.
- Superadmin Channels page and "via Till" labelling.
- Developer portal.

## 5. Build order

Each step is shippable on its own and Till can start at step 2.

| Step | Delivers | Till can do |
|---|---|---|
| 1 | Channel model, client-credentials token, channel guard on terminal routes, `PP-Register` header | Transact against merchants we create by hand |
| 2 | Provisioning endpoints, `externalRef` idempotency, owner invite | Enable a restaurant end to end with no RFM involvement |
| 3 | Superadmin Channels page, kill switch, "via Till" labels, per-channel rate limits | (our side) |
| 4 | Test-mode credentials, channel webhooks | Build and certify safely, stay in sync |
| 5 | Refund and `cashierRef` | Handle returns and split-by-server reporting |
| 6 | Developer portal with gated docs and channel-scoped OpenAPI | Self-serve documentation |

Step 1 unblocks Till's engineers immediately because the sale flow is unchanged.
Steps 2 and 3 should ship together before any real restaurant is enabled,
because provisioning without the kill switch is provisioning without governance.

## 6. Decisions (taken 2026-09-23)

| # | Question | Decision |
|---|---|---|
| 1 | Auto-activate merchants Till creates, or queue for approval? | **Superadmin approval required.** Each request emails `zain.ali@rfmloyaltyco.ae` with a one-click link. See §3.2. |
| 2 | Test mode on production, or a separate staging environment? | **Test-mode credentials on production.** See §3.7. |
| 3 | Refund semantics | **Pro-rata clawback; balance may go negative and nets against future earns.** See §3.3. |
| 4 | Billing counterparty for wallet top-ups | **Each restaurant.** One Group per restaurant, as drawn in §3. Till is never the payer. |
| 5 | Name of the feature inside Till | Open; "Partners Points" assumed until Till says otherwise. |

## 7. What to tell Till now

Till's engineers can start reading `docs/pos-integration-api.md` today because the
sale flow will not change. Before we design further we need from them:

- Whether their backend or their register devices will call us (§3.5).
- Their identifiers for merchant, location and register, and whether they are
  stable across re-installs.
- Owner contact details available at enable time, for the portal invite.
- Whether Till wants loyalty events pushed back (webhooks) or will only read.
- Expected merchant count at launch and at twelve months, for rate limits.
- Refund and split-bill behaviour in Till, so refund semantics match.

## Sources

- Toast partner authentication: https://doc.toasttab.com/doc/devguide/authentication.html
- Toast location access and partner webhooks: https://doc.toasttab.com/doc/devguide/apiPartnersGettingAccessibleRestaurants.html
- Toast partner integration process: https://doc.toasttab.com/doc/devguide/integrationDevProcess.html
- Stripe Connect, calls on behalf of connected accounts: https://docs.stripe.com/connect/authentication
- Stripe Connect overview: https://docs.stripe.com/connect
- Square OAuth overview: https://developer.squareup.com/docs/oauth-api/overview
- Square OAuth permissions: https://developer.squareup.com/docs/oauth-api/square-permissions
- Clover OAuth flow overview: https://docs.clover.com/dev/docs/oauth-flows-in-clover
- Punchh POS API, first call and keys: https://developers.partech.com/docs/dev-portal-pos/1fbfdfdd05a86-make-your-first-pos-api-call
- Punchh POS certification: https://developers.partech.com/docs/dev-portal-pos/additional-topics/poscertification
- Talon.One Integration API vs Management API: https://docs.talon.one/integration-api
- Voucherify integration blueprint: https://docs.voucherify.io/get-started/integration-overview
