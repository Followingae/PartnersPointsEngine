# Partnerships Module — Lulu Happiness Points (Architecture & Build Plan)

> Status: PLAN (not yet built). Owner: Partners Points platform team.
> Scope: a new **Partnerships** capability that lets our merchants award/redeem a
> third-party partner currency — starting with **Lulu Happiness Points** — funded
> on a **prepaid allowance** basis, with a customer-facing **conversion** flow.

---

## 1. The concept in one paragraph

Today every merchant on Partners Points runs a **closed-loop** program: customers
earn that merchant's own points. The Lulu partnership adds an **open-loop bridge**:
a merchant can be flagged as a **Lulu Awarding Merchant**, after which their
customers can **convert** the merchant's points into **Lulu Happiness Points**
(Lulu's own loyalty currency) from the customer mobile app. The merchant pre-funds
an **Awarding Allowance** (prepaid); every conversion draws that allowance down.
When it runs low we remind them; when it's empty, conversions pause until they
top up. Under the hood this is an **integration with the Lulu Happiness Loyalty
Engine** that credits the customer's Lulu account in real time.

This is a **sales lever**: "Use Partners Points and also let your customers turn
their points into Lulu Happiness Points."

---

## 2. Why it fits our architecture

We already have the primitives this needs:

| Need | Existing primitive we extend |
|---|---|
| Prepaid balance that draws down | The **wallet ledger** + `GroupWallet` (merchants already pre-fund a points-liability wallet; top-up + hybrid drawdown exist) |
| Atomic, idempotent value movement | The **double-entry ledger** (`earn`/`redeem`/`drawdown`, idempotency keys, reversal) |
| Burning a customer's points | The existing **redeem** path (authorize → capture → void) |
| Per-merchant feature on/off + superadmin control | **Module entitlements** (`moduleAccess`) + **governance modes** |
| Low-balance reminders | The existing **low-balance alert** pattern on group wallets |
| Per-brand config screens | Brand console + superadmin merchant/brand detail |
| Customer identity & app | Customer membership + customer mobile app |

So the partnership is largely **new config + a connector + a conversion operation**
layered on top of mechanisms that already exist, not a rewrite.

---

## 3. New domain entities (schema additions)

All additive. Names are proposals.

- **`Partner`** — a third-party loyalty partner. Row for Lulu.
  `id, key('lulu'), name, status, connectorConfigEnc (encrypted creds), defaultRatio,
  pointsCurrencyName('Lulu Happiness Points'), createdAt`.
- **`PartnerMerchant`** — enablement + config of a partner for a specific
  brand/group. `id, partnerId, brandId, enabled, conversionRatio (merchant pts → partner pts),
  minConversion, maxConversionPerDay, status, governance (superadmin-managed vs merchant-editable),
  createdAt`. (One per brand × partner.)
- **`AllowanceWallet`** — the merchant's prepaid awarding balance for a partner.
  Modeled as a **new ledger asset** in the existing wallet ledger (preferred — reuses
  postings/idempotency), or a dedicated table mirroring `GroupWallet`
  (`balanceMinor, lowBalanceThreshold, currency/unit, status`). **Recommendation:
  reuse the ledger** with an asset like `lulu_allowance:<brandId>` and account types
  `allowance_liability`, `allowance_clearing`, `allowance_spent`.
- **`PartnerCustomerLink`** — maps our customer membership/person to their Lulu
  member identity. `id, personId (or membershipId), partnerId, partnerMemberRef
  (Lulu card/phone), linkedAt, status`. Needed to credit the right Lulu account.
- **`Conversion`** — one conversion event (the partner-currency analogue of a
  redeem). `id, brandId, membershipId, partnerId, sourcePoints, partnerPoints,
  ratio, allowanceCostMinor, status (pending|completed|failed|reversed),
  partnerTxnRef, idempotencyKey, journalId, createdAt`.
- **`ConversionRule`** (optional, can live on `PartnerMerchant`) — ratio, caps,
  eligibility (min tier, min balance), blackout windows.

Reuse the **`Outbox`** + worker for async partner-API calls and reconciliation.

---

## 4. The conversion flow (end-to-end, atomic)

Customer taps "Convert to Lulu Happiness Points" in the app:

1. **Eligibility check** — merchant has the partnership enabled, customer's Lulu
   account is linked, amount within min/max, merchant **allowance has enough**.
2. **Preview** — show ratio, resulting Lulu points, any fee, and a clear "you'll
   have X left" for the customer's merchant wallet.
3. **Confirm → single DB transaction (idempotent):**
   - `redeem` (authorize→capture) the customer's **merchant points** (existing path).
   - `drawdown` the **merchant allowance** by the cost (Lulu points × cost-per-point + platform margin).
   - Insert a `Conversion` row as `pending` with an idempotency key.
4. **Credit Lulu** — call the **Lulu Happiness Loyalty Engine** to credit the
   customer's Lulu account `partnerPoints`. On success → `Conversion.completed`,
   store `partnerTxnRef`. On failure → **reverse** the ledger postings (release the
   redeem hold + refund allowance) and mark `failed`; surface a friendly retry.
5. **Reconciliation worker** — for `pending` conversions where the Lulu call
   timed out, poll Lulu / retry with the same idempotency key; never double-credit.

Key invariants: **never burn customer points without crediting Lulu**, and **never
credit Lulu without drawing the merchant allowance** — both guaranteed by the
single transaction + reversal + idempotency (same guarantees as our redeem path).

---

## 5. Allowance wallet mechanics (prepaid)

- **Funding**: superadmin credits the allowance (like the existing group-wallet
  top-up), or the merchant requests a top-up that superadmin approves. Payment
  collection is out-of-band (invoice) initially.
- **Cost model**: each conversion costs `partnerPoints × costPerPartnerPointMinor
  + platformMarginBps`. Configurable per partner/merchant (mirrors `CostRule`).
- **Thresholds & reminders**: `lowBalanceThreshold` per allowance; a worker emits
  reminders (email/webhook/in-console banner) at threshold, and **auto-pauses**
  conversions at zero (customers see "temporarily unavailable").
- **Statements**: allowance ledger export (CSV) + monthly statement, reusing the
  wallet-ledger reporting.

---

## 6. Superadmin enhancements (the new **Partnerships** module)

New left-nav item **Partnerships**:

- **Partners list** → Lulu (logo, status, # enabled merchants, total allowance
  outstanding, conversions 30d).
- **Partner detail (Lulu)**:
  - Connector config: API base URL, credentials (stored **envelope-encrypted**),
    sandbox/prod toggle, health check, last sync.
  - Global defaults: default conversion ratio, cost-per-point, min/max, currency name.
  - Enabled merchants table + "Enable a merchant".
- **Enable a merchant** (from here *or* from the existing Merchant/Brand detail):
  pick brand → set conversion ratio, allowance threshold, daily caps, governance
  (superadmin-managed vs merchant-editable) → creates `PartnerMerchant` + allowance.
- **Allowance management** per merchant: balance, fund/top-up, threshold, txns,
  pause/resume.
- **Reports**: conversion volume & value, allowance burn-down, per-merchant
  leaderboard, **reconciliation status** (pending/failed conversions), Lulu API
  health/error rate.
- **Reflected across existing surfaces**:
  - Merchant (group) & Brand detail pages get a **"Partnerships"** section showing
    Lulu status + allowance + quick actions.
  - **Module entitlements** gain a `partnerships` (or `lulu`) toggle, so the brand
    console only shows the Lulu section when enabled.
  - **Governance** applies: if superadmin-managed, the brand sees Lulu config
    read-only and edits go through change-requests.
  - **Audit log** records every enablement, ratio change, top-up, pause.

---

## 7. Merchant (brand console) enhancements

A new **"Lulu Happiness"** section (visible only when entitled):

- **Status card**: enabled/paused, conversion ratio, currency name, governance note.
- **Allowance wallet**: current balance, low-balance threshold, **Top-up request**
  button, burn-down chart, threshold reminder settings.
- **Conversion reports**: volume, value, top customers converting, daily caps usage.
- **Activity**: recent conversions (customer, merchant points in, Lulu points out,
  status).
- All edit controls respect governance mode (read-only when platform-managed).

---

## 8. Customer mobile app (summary — full spec in `mobile-app-spec.md`)

- Each merchant wallet that's Lulu-enabled shows a **"Convert to Lulu Happiness
  Points"** action.
- First-time: **link Lulu account** (enter Lulu card/phone → verify via Lulu API).
- **Convert sheet**: amount, live ratio, resulting Lulu points, confirm, success
  receipt with `partnerTxnRef`.
- **Conversion history** in Activity.
- Graceful states: not linked, merchant allowance depleted (paused), Lulu down.

---

## 9. Lulu Happiness Loyalty Engine — integration (connector)

A dedicated **`LuluConnector`** service (mirrors our `WebhookService`/HMAC patterns):

- **Auth**: per-partner credentials (API key / OAuth client-credentials), stored
  envelope-encrypted in `Partner.connectorConfigEnc`; never in the repo.
- **Endpoints we need from Lulu** (to confirm with Lulu's API team):
  - `lookupMember(ref)` — validate/locate a Lulu member by card/phone (for linking).
  - `creditPoints(memberRef, points, idempotencyKey, ref)` — award Happiness Points.
  - `getBalance(memberRef)` — optional, to show the customer their Lulu balance.
  - (optional) `reversePoints` / status lookup for reconciliation.
- **Reliability**: idempotency key per conversion, retries with backoff (BullMQ
  worker), timeouts, circuit-breaker; **reconciliation** job for pending txns.
- **Webhooks/callbacks**: if Lulu posts async confirmations, verify signature and
  settle the `Conversion`.
- **Sandbox vs prod**: env-driven base URL + creds; a connector health check.
- **Observability**: log every call (correlation id), surface error rate in the
  Partnerships reports.

---

## 10. Financial & accounting model

- The allowance is a **prepaid liability** of Partners Points to the merchant until
  spent on conversions; each conversion recognizes revenue/cost (Lulu point cost +
  our margin) — same shape as the existing hybrid drawdown + cost rules.
- **Breakage**: unused allowance policy (refundable vs expiring) — decision needed.
- **Settlement with Lulu**: periodic reconciliation of credited points vs our
  records; a settlement report. Define who owes whom and cadence with Lulu.

---

## 11. Phased rollout

- **Phase 1 — Foundations (no Lulu API yet):** schema (`Partner`, `PartnerMerchant`,
  allowance ledger asset, `Conversion`, `PartnerCustomerLink`); superadmin
  Partnerships module (create Lulu partner, enable merchant, fund allowance,
  thresholds); `partnerships` entitlement; brand-console Lulu section (read).
- **Phase 2 — Live conversion:** `LuluConnector` (sandbox), account linking,
  customer convert flow (mobile), atomic conversion + reversal + idempotency,
  reconciliation worker.
- **Phase 3 — Operate & scale:** reports, burn-down + auto-pause + reminders,
  statements/settlement, daily caps, multi-partner readiness (the model is
  partner-generic so a second partner is config, not code).

---

## 12. Decisions / open questions (need answers before Phase 2)

1. **Lulu API**: exact endpoints, auth method, idempotency support, sandbox access,
   rate limits, async vs sync crediting, member lookup key (card # vs phone).
2. **Conversion economics**: ratio (e.g. 100 merchant pts → 10 Lulu pts?), cost per
   Lulu point to the merchant, our platform margin, any customer-facing fee.
3. **Who funds the allowance** and how payment is collected (invoice vs card).
4. **Allowance breakage/refund** policy.
5. **Lulu account linking & KYC**: what we must collect/verify; data-sharing/consent
   with Lulu (privacy).
6. **Limits**: per-customer/day caps, min conversion, anti-abuse.
7. **Reversibility**: can Lulu points be clawed back if a conversion is disputed?

---

## 13. Module/entitlement & governance summary

- New entitlement key: **`partnerships`** (or `lulu`) on `Brand.moduleAccess`,
  toggled from the superadmin **Modules & access** screen we already built.
- New governance entity type **`partner_merchant`** so enablement/ratio edits can be
  autonomous, approval-required, or platform-managed per brand.
- New permission: **`partner.manage`** (platform) for the Partnerships module.
