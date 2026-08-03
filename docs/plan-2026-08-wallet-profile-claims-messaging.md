# Plan — Digital cards, profile depth, missed-points claims, transactional messaging

**Status:** awaiting approval. Nothing below is built.
**Date:** 2026-08-03

Four workstreams, researched against the codebase and against Apple's and Google's
official documentation. Ground-truth findings are separated from proposals, because
several assumptions we started with turned out to be wrong.

---

## What the research changed

Three findings reshape the work:

1. **The QR path is already complete end to end.** The terminal scans QR today
   (`ScanScreen.kt`, CameraX + ZXing), sends identifier type `qr`
   (`CustomerScreen.kt:56`), and every membership already has a `qr` identifier
   registered (`wallet_scan_code`, `wallet_join_brand`). A barcode wallet pass needs
   **zero terminal changes**.

2. **Segments are not wired to anything.** `Campaign` has no `segmentId`; the
   messaging module states "no send — provider wiring is later"; and
   `GET /manage/segments/:id/members` has no caller. Adding nationality to targeting
   delivers a filter over an audience nobody can message.

3. **Nothing can award points after the fact.** `JournalKind.adjust` exists as an
   enum value, but no ledger operation implements it
   (`packages/db/src/ledger/operations.ts` has earn / authorize / capture / void /
   topup / drawdown only). The missed-points workstream starts further back than the
   others.

---

## Workstream 1 — Digital loyalty & stamp cards (Apple + Google Wallet)

### Findings

**Barcode passes are self-serve and fast on both platforms.**

| | Apple Wallet | Google Wallet |
|---|---|---|
| Approval to issue barcode passes | **None.** Pass Type ID and certificate are self-serve | Issuer account instant; **publishing access 1–2 business days** |
| App required | **No.** A `.pkpass` is a signed ZIP opened from a link | No |
| Test before approval | n/a — nothing to approve | **Demo mode works immediately**, saves to allow-listed accounts, production API |
| Cost | **99 USD/year** developer programme | No fee documented *(worth one confirmation with Google)* |
| Time to first signed pass | **Under an hour** once enrolled; enrolment itself is hours to ~2 weeks | Same day |

**Tap is gated — and the two platforms are gated differently.**

- **Google Smart Tap** is gated on the *terminal vendor*, not on us. The terminal
  needs a Collector ID and key pair, and must be certified. Google references 30+
  approved terminal providers. **Whether Feitian is among them is unconfirmed and is
  the single cheapest question that could unlock tap — we should ask them directly.**
- **Apple VAS** is gated on Apple's discretion. The entitlement is requested through a
  merchant-support form with no published criteria, timeline, or SLA; readers must
  already accept Apple Pay and be VAS-certified. Developer reports describe denials
  without reason. **Plan as though Apple tap may never arrive.**

Our terminal *hardware* is not the constraint: `NfcReader.openCardExSyn` and
`sendApduCustomer` give raw ISO 14443 polling and APDU exchange, which is exactly the
primitive both protocols are built on.

### Two decisions that must be made in v1 or we lose the ability to add tap later

Shipping QR first does **not** paint us into a corner — but only if:

1. **Every Apple pass ships with `webServiceURL` and `authenticationToken`.**
   A pass issued without them gives the device no callback and *can never be updated*.
   Adding NFC later would then mean reissuing every card and asking every customer to
   re-add it. This is also what we need for balance updates regardless.

2. **The member token stays ≤ 64 bytes.** That is Apple's hard `nfc.message` ceiling
   and it **truncates silently**. Exceeding it forecloses Apple NFC permanently.
   Our current `loyaltyId` (e.g. `TEST-9D0203`, `PP-CBB8C69B`) is far inside this.

With both in place: on Google, already-issued passes gain tap through a `PATCH` — no
reissue, no re-add. On Apple, identity is `passTypeIdentifier + serialNumber`, so an
updated pass overwrites in place and the customer never re-adds.

> **Residual risk, unverified:** whether Apple grants the NFC entitlement against an
> *existing* Pass Type ID or requires a new one. If the latter, identity changes and
> reissue is unavoidable regardless of the web service. Criteria sit behind an
> authenticated form and cannot be read. This is the only genuine corner-painting risk
> and it is Apple-side, not ours.

### Engineering asymmetry, which drives the estimate

- **Google:** one authenticated `PATCH` per update. No signing, no push, no device
  bookkeeping.
- **Apple:** five web-service endpoints (register, unregister, list-updatable, get-pass,
  log), an APNs pipeline, three tables (Device / Pass / Registration), and **a full
  re-signed `.pkpass` per update**. Pass-update pushes work in **APNs production only —
  there is no sandbox**. The signing key belongs in a KMS, not on disk.

Apple is roughly the whole cost of this workstream. Google is a day.

### Dynamic stamp cards

The design already supports this: a stamp card is a repeatable `visits` challenge
(`isStampCard` on `GET /customer/challenges`). Both platforms can render it —
Google via `loyaltyPoints` / `secondaryLoyaltyPoints`, Apple via secondary/auxiliary
fields — and both update through the mechanisms above. A stamp card and a points card
are the same pass with different fields, not two products.

### Proposed shape

- `packages/wallet-pass` — pass building and signing, both platforms behind one interface
- `apps/api/src/modules/wallet-pass/` — issuance, the Apple web service, update dispatch
- Reuse the existing `qr` identifier as the barcode payload — no new terminal contract
- Mobile: "Add to Apple Wallet" / "Add to Google Wallet" on the card detail screen
- Update triggers: earn, redeem, tier change, stamp progress — driven from the same
  outbox introduced in workstream 4

**Sequence:** Google first (cheap, fast, proves the model) → Apple barcode → apply for
Smart Tap via Feitian and Apple VAS in parallel → tap when and if granted.

---

## Workstream 2 — Nationality and profile depth

### Findings

`Person` has `fullName`, `gender`, `birthdate` (plaintext, queryable by design) and
encrypted `phone`/`email`. **No nationality, and no JSON attribute bag** — every new
attribute is a schema change.

**The stated purpose of those fields is unfulfilled.** The schema comment says they are
"stored queryable so they can drive segments", but `segment.service.ts` exposes only
`lifetime | recencyDays | frequency | status | tier`, and the segment CTE never joins
`person`. **No demographic targeting exists at all.** Nationality would be the first —
and the join it needs also unlocks gender and birthdate.

**Two bugs found in passing, worth fixing inside this workstream:**

- `wallet_update_profile` uses `COALESCE(p_x, x)` on every column, so **passing null
  never clears a field** — while the DTO documents `birthdate: null` as "null clears it"
  and the mobile edit screen relies on it. Clearing your birthday silently does nothing.
- `terminal_enroll_person` is **duplicated in two SQL files** that must be hand-kept in
  sync (`2026-07-28_person_access_and_receipts.sql` and `rls.sql`). Adding a field means
  editing both, or they drift.

### Decision needed — how nationality is represented

There is **no country list anywhere in the repo**. The precedent is poor: `gender` is a
free-form string whose valid values live in *three independently hardcoded UI lists*.
Repeating that for ~200 countries would be considerably worse.

**Recommendation: ISO 3166-1 alpha-2, with one shared list in `packages/shared`**,
consumed by the mobile picker, both consoles, and segment validation. Store the code,
render the name.

### Decision needed — filter only, or delivery too?

Nationality targeting is only useful if something can act on a segment. Options:

- **(a) Filter only.** Add the attribute and the segment join. Brands can size an
  audience; nothing can message it. Small.
- **(b) Filter + delivery.** Add `segmentId` to campaigns, and make messaging actually
  send to a segment. Considerably larger, and overlaps workstream 4's provider wiring.

**Recommendation: (b), sequenced after workstream 4**, so both reuse one WhatsApp/email
sending path rather than building two.

### Proposed shape

- `nationality` on `Person`; migration; both copies of `terminal_enroll_person`;
  `wallet_update_profile` (arity change — drop and recreate, not `CREATE OR REPLACE`)
- Segment engine: join `person`, add demographic fields, add `in` / `not in` operators
  (nationality is enum-like and `eq` alone is close to useless)
- Segment builder UI: `FIELDS` is hardcoded client-side and hand-synced with the server.
  **Propose a field-metadata endpoint** so this stops drifting.
- Mobile: a country picker — **no picker component exists today**; gender uses three
  inline chips, which will not scale
- Consoles: display and edit nationality on the customer screens

### Profile completion

`onboarding/profiling.tsx` is a static mock — the birthday fields render the literals
`"14"` and `"March"`. Its intent is sound and worth building: one question per screen,
points paid per attribute disclosed. **There is no points-for-profile-completion
mechanism server-side**, so this is new work, not a wiring-up. It also needs the ledger
adjustment operation from workstream 3 — the two share a foundation.

---

## Workstream 3 — Missed points claims

### Findings

No path awards points after a transaction. `JournalKind.adjust` exists; no operation
implements it. The governance change-request machinery exists but is built for
brand-config approvals through an appliers registry — the wrong shape for a customer
claim, though the approve/reject/audit pattern is worth mirroring.

### Proposed flow

1. **Customer raises a claim** in the app: brand, date, amount, receipt/order number,
   optionally a photo. Constrained to a window (propose 7 days) and to brands they hold.
2. **Server checks what it already knows.** Most claims are decidable without a human:
   - a `Receipt` exists for that order and carries no earn → strong evidence
   - a terminal transaction exists for that member and amount → strong evidence
   - nothing matches → needs a human
3. **Queue for approval** in the brand console — brands adjudicate their own claims;
   superadmin sees all and can override, consistent with how governance already works.
4. **On approval, award through a new `adjustPoints` ledger operation**, idempotent on
   the claim id, journal kind `adjust`, fully audited. Ledger integrity is the point of
   this system; a manual credit must be as traceable as an earn.
5. **Notify the customer** through workstream 4's messaging.

### Guards this needs

- One claim per order number per brand; idempotent approval
- Rate limit per customer; visible claim history to make patterns obvious
- Auto-expire stale claims
- Anti-abuse: a customer claiming repeatedly against a brand should surface to it

### New surface

- `Claim` model; `POST /customer/wallet/claims`, `GET /customer/wallet/claims`
- `GET/PATCH /manage/claims` for the brand console; superadmin visibility
- `adjustPoints` in `packages/db/src/ledger/operations.ts`
- Mobile: raise a claim, see its status — reachable from the activity screen where a
  customer notices the gap

---

## Workstream 4 — Receipt badge and per-transaction WhatsApp

### App-store badge on the eReceipt

Small and self-contained. The receipt page's CSP already allows `img-src 'self' data:
https:`, so official badge images work either remotely or inlined as data URIs
(inlining is better — no third-party dependency on a page we control). It must not
collide with the floating ad already docked at the bottom, and it should serve the
right store per platform.

### WhatsApp on every transaction

**The right mechanism already exists and is unused for this.** There is a transactional
outbox (`OutboxService.emit`, relayed by `WebhookService.relayOutbox`) — but only
governance emits; terminal transactions emit nothing.

Emitting on earn / redeem-capture / void **inside the same transaction** gives:

- **exactly-once** semantics — the ledger operation is idempotent, so a replayed earn
  commits no second event; a message can never double-send on retry
- **no added latency at the till** — the cashier is not waiting on Twilio
- **retries for free** — a failed send is a row that can be retried

Sending inline from the terminal path would fail all three. This is the single most
important design decision in this workstream.

### Templates

Every business-initiated WhatsApp message needs a Meta-approved template — the sign-in
template took minutes to approve, so this is a formality, but it is lead time.
Proposed set, each with a button linking to the eReceipt:

| Template | Trigger |
|---|---|
| First transaction / welcome | first earn for a new member at that brand |
| Points earned | every earn |
| Reward redeemed | redemption capture |
| Points adjusted | claim approved (workstream 3) |

### Consent — needs a decision

There is **no opt-out model** in the schema. Transactional messages are generally
defensible, but "a WhatsApp after every transaction" sits close to marketing, and UAE
TDRA rules and Meta's own policy both care about this. **Recommend a per-customer
messaging preference and an opt-out footer before this goes live**, not after. Flagging
it rather than deciding it.

---

## Proposed sequence

1. **Workstream 4 first** — outbox events and the WhatsApp sender. Everything else wants
   to notify someone, and this builds the path once. Badge ships alongside.
2. **Workstream 1, Google** — proves pass issuance cheaply. Apply for Apple enrolment and
   ask Feitian about Smart Tap on day one, since both have lead time.
3. **Workstream 1, Apple** — the web service and APNs; the largest single piece.
4. **Workstream 3** — claims, on top of the ledger adjustment. Notifications already exist
   by then.
5. **Workstream 2** — nationality, demographic targeting, and segment→campaign delivery,
   reusing workstream 4's sending path.

---

## Open questions

1. **Nationality representation** — ISO 3166 alpha-2 as recommended?
2. **Filter only, or segment→campaign delivery too?**
3. **Messaging consent** — add a preference model now, or accept transactional-only and
   revisit?
4. **Claim window and evidence** — 7 days? photo required, or optional?
5. **Who adjudicates claims** — brand, superadmin, or brand with superadmin override?
6. **Apple Developer enrolment** — is there an existing organisation account, or does
   enrolment need starting (it carries the longest lead time here)?
7. **Feitian Smart Tap certification** — worth asking them this week regardless of when
   we build.
