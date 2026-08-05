# Partners Points — POS Integration API

**Version 1 · Terminal Gateway**

This document is for engineering teams integrating a third-party point-of-sale
system with Partners Points. It covers everything needed to identify a customer,
quote and award points, redeem rewards, and reconcile after an outage.

If you are building against our own payment terminal, you do not need this — that
app already speaks this protocol.

- **Base URL** — `https://api.partnerspoints.ae/v1`
- **All paths below are relative to that base.** A path written
  `/terminal/quotes` is `https://api.partnerspoints.ae/v1/terminal/quotes`.
- **Content type** — `application/json` on every request with a body.
- **Encoding** — UTF-8.

---

## 1. Concepts

Four things are worth understanding before the first call.

**Points are per brand.** A customer holds a separate balance at every brand they
have joined. Your credentials are issued against one brand (and usually one
branch), so every call is implicitly scoped — you never pass a brand id.

**Money is in minor units.** `amountMinor: 2450` is AED 24.50. There are no
decimals anywhere in this API. Points are whole integers.

**A member token identifies a customer for one transaction.** You resolve a
phone number or scanned code into a short-lived opaque token, then pass that
token to everything else. The token expires after **10 minutes** — resolve at the
start of a sale, not at the start of a shift.

**Earning is one step; redeeming is two.** Awarding points happens immediately.
Spending points is authorize-then-capture, so the points are held while the card
payment goes through and released automatically if it fails.

---

## 2. Authentication

Every request to `/terminal/*` is signed with HMAC-SHA256. There are no bearer
tokens and no login call.

You are issued two values:

| Value | Example | Handling |
|---|---|---|
| Publishable key id | `pk_9dK2mQ7xR4vN8bTz` | Sent in the clear on every request |
| Signing secret | `sk_Lp3wQ8nH2vX...` | Never transmitted. Store it where your card keys live. |

### 2.1 The header

```
Authorization: Loyalty-HMAC publishableKeyId=<id>,ts=<unix-seconds>,nonce=<unique>,sig=<hex>
```

No spaces after the commas. `ts` is Unix time in **seconds**. `nonce` is any
value unique to this request — a UUID is fine.

### 2.2 The string to sign

Five fields joined by a newline (`\n`), in this exact order:

```
<METHOD>\n<PATH>\n<TS>\n<NONCE>\n<SHA256-HEX-OF-BODY>
```

- **METHOD** — uppercase: `GET`, `POST`.
- **PATH** — the path **including** the `/v1` prefix and **excluding** any query
  string. For `https://api.partnerspoints.ae/v1/terminal/quotes?x=1`, sign
  `/v1/terminal/quotes`.
- **TS**, **NONCE** — byte-identical to what you put in the header.
- **Body hash** — lowercase hex SHA-256 of the **exact bytes you send**. For a
  request with no body, hash the empty string, which is always
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

`sig` is the lowercase hex HMAC-SHA256 of that string, keyed with your signing
secret.

> **The body must be hashed byte-for-byte as transmitted.** Serialize your JSON
> once, hash that string, and send that same string. Re-serializing between
> hashing and sending — which some HTTP clients do — changes key order or
> whitespace and the signature will not verify.
>
> **Query strings are not signed.** Do not put anything security-relevant in
> one.

### 2.3 Reference implementation

```javascript
const crypto = require('node:crypto');

function sign({ method, path, body, keyId, secret }) {
  const raw = body ? JSON.stringify(body) : '';
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(raw).digest('hex');

  const canonical = [method.toUpperCase(), path, ts, nonce, bodyHash].join('\n');
  const sig = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        `Loyalty-HMAC publishableKeyId=${keyId},ts=${ts},nonce=${nonce},sig=${sig}`,
    },
    // Send this exact string — do not re-serialize.
    body: raw,
  };
}
```

```python
import hashlib, hmac, json, time, uuid

def sign(method, path, body, key_id, secret):
    raw = json.dumps(body, separators=(",", ":")) if body is not None else ""
    ts = str(int(time.time()))
    nonce = str(uuid.uuid4())
    body_hash = hashlib.sha256(raw.encode()).hexdigest()

    canonical = "\n".join([method.upper(), path, ts, nonce, body_hash])
    sig = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()

    return {
        "headers": {
            "Content-Type": "application/json",
            "Authorization":
                f"Loyalty-HMAC publishableKeyId={key_id},ts={ts},nonce={nonce},sig={sig}",
        },
        "body": raw,   # send exactly this
    }
```

### 2.4 Clock skew and replay

Requests are rejected if `ts` is more than **±5 minutes** from server time. Keep
the till's clock synchronised; a drifting clock presents as every request
failing with `401`.

Each nonce may be used once within that window. Retrying a failed request
requires a **new** `ts` and `nonce` — and, because the timestamp is signed, a new
signature. Safe retries are handled by idempotency keys (§5.2), not by resending
identical bytes.

### 2.5 Verifying your implementation

`GET /terminal/diagnostics/ping` requires a valid signature and changes nothing.
Use it to confirm signing before touching a real balance.

```
GET /v1/terminal/diagnostics/ping
```

```json
{ "ok": true, "brandId": "019fc6…", "actor": { "type": "terminal", "id": "019fc7…" } }
```

It also tells you which brand and terminal your key is scoped to — worth
checking before a fleet rollout, in case two tills were handed the same key.

A `401` here means the signature is wrong. The most common causes, in order:
signing the path without `/v1`; including the query string; re-serializing the
body after hashing; milliseconds instead of seconds in `ts`.

---

## 3. Errors

Every failure returns the same envelope with the matching HTTP status.

```json
{
  "error": {
    "code": "validation_error",
    "message": "phone must be E.164 (+9715xxxxxxxx)",
    "requestId": "3f9a1c7e-..."
  }
}
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `validation_error` | The request is malformed, or the operation isn't valid in the current state. `message` is written to be shown to a cashier. |
| 401 | `unauthorized` | Signature, timestamp, nonce or key problem. |
| 403 | `forbidden` | The key is not permitted to do this. |
| 404 | `not_found` | No such member, transaction or voucher **for this brand**. |
| 409 | `conflict` | The change was queued for approval rather than applied. |
| 429 | `rate_limited` | Back off and retry. |
| 500 | `internal_error` | Our fault. Retry with the same idempotency key. |

**Quote `requestId` in any support conversation** — it identifies the exact
request in our logs.

`message` is safe to display. `code` is what you should branch on; do not parse
`message`.

---

## 4. Identifying a customer

### 4.1 Resolve an existing customer

`POST /terminal/members/resolve`

```json
{ "type": "phone", "value": "+971501234567" }
```

`type` is one of `phone`, `email`, `qr`, `nfc`, `loyalty_id`, `card_token`.
Use `qr` with the exact string scanned from the customer's app.

```json
{ "memberToken": "eyJhbGciOi..." }
```

`404` means this brand has no such member — offer to enrol them.

### 4.2 Enrol at the till

`POST /terminal/members/enroll`

```json
{ "phone": "+971509876543", "fullName": "Optional" }
```

Phone must be E.164. Idempotent: enrolling a number that already exists resolves
it instead of failing.

```json
{ "memberToken": "eyJ...", "created": true }
```

### 4.3 Show the cashier who this is

`POST /terminal/members/context`

```json
{ "memberToken": "eyJ..." }
```

```json
{
  "displayName": "Maya Khoury",
  "loyaltyId": "PP-4X7K2M",
  "tier": "Silver",
  "balance": { "active": "1150", "available": "1150", "pending": "0", "lifetime": "4820" },
  "joinedAt": "2026-02-14T09:12:00.000Z",
  "challenges": [
    {
      "id": "…",
      "name": "Coffee card",
      "unit": "visits",
      "isStampCard": true,
      "progress": 8,
      "target": 10,
      "rewardName": "Free coffee",
      "rewardPoints": 0
    }
  ]
}
```

Balances are **strings** — they are 64-bit integers and will overflow a
JavaScript `number` at scale. Keep them as strings or parse to a big integer.

`challenges` is worth surfacing. "Two more visits and your next coffee is free"
is the single most effective thing a cashier can say, and this is the only moment
they have the customer in front of them.

---

## 5. Taking a sale

### 5.1 Quote first (optional, changes nothing)

`POST /terminal/quotes`

```json
{ "memberToken": "eyJ...", "amountMinor": 2450, "isVisit": true, "redeemPoints": 500 }
```

```json
{
  "earn": {
    "points": 48,
    "base": 24,
    "multiplier": 2,
    "bonuses": [{ "id": "…", "name": "Happy Hour", "factor": 2 }]
  },
  "redeem": {
    "points": 500,
    "affordable": true,
    "valueMinor": 500,
    "belowMinimum": false
  }
}
```

Show `bonuses` to the customer. A doubled figure with nothing beside it looks
identical to a promotion that failed to run.

A quote is a preview and can go stale — an hour can end between quoting and
charging. The transaction response is authoritative.

### 5.2 Award points

`POST /terminal/transactions`

```json
{
  "intent": "earn",
  "memberToken": "eyJ...",
  "idempotencyKey": "<uuid>",
  "amountMinor": 2450,
  "isVisit": true,
  "sourceEvent": "ORDER-10482"
}
```

```json
{
  "id": "019fc6…",
  "intent": "earn",
  "state": "captured",
  "points": "48",
  "amountMinor": "2450",
  "captureJournalId": "…",
  "completed": [
    { "id": "…", "name": "Coffee card", "rewardName": "Free coffee",
      "badgeName": "Free coffee · CODE 7QX4M2", "voucherCode": "7QX4M2" }
  ],
  "stamps": [
    { "id": "…", "name": "Coffee card", "progress": 10, "target": 10,
      "completions": 1, "justCompleted": true }
  ],
  "bonuses": [{ "id": "…", "name": "Happy Hour", "factor": 2 }]
}
```

**About `idempotencyKey`** — generate one UUID per sale and reuse it for every
retry of that sale. A repeat with the same key returns the original transaction
and awards nothing further. This is your protection against double-awarding on a
timeout: if you do not get a response, retry with the *same* key.

Keys are scoped to your terminal, so they only need to be unique to you.

**`completed` and `stamps` are the celebration.** When `justCompleted` is true
the customer has just filled a card — print it prominently and say the reward
name and code. A stamp card that fills silently is a stamp card the customer
stops collecting.

### 5.3 Spend points — authorize, then capture

**Step 1 — hold the points** while you take payment:

`POST /terminal/transactions`

```json
{ "intent": "redeem", "memberToken": "eyJ...", "idempotencyKey": "<uuid>", "points": 500 }
```

```json
{ "id": "019fc7…", "intent": "redeem", "state": "authorized", "points": "500" }
```

The customer's available balance drops immediately. Nothing is spent yet.

**Step 2a — payment succeeded:**

`POST /terminal/transactions/{id}/capture` → `state: "captured"`

**Step 2b — payment failed or the sale was abandoned:**

`POST /terminal/transactions/{id}/void` → `state: "voided"`, points returned.

Capture and void take no body. Both are only valid from `authorized`; anything
else returns `400` naming the current state.

> **Always call one of them.** An authorization left open holds the customer's
> points. Void is the correct call whenever the sale does not complete —
> including when your own process crashed and you found the hold on restart.

**Step 3 — if you are unsure what happened:**

`GET /terminal/transactions/{id}` returns the definitive state. Use this after a
timeout rather than guessing.

States: `pending`, `authorized`, `captured`, `voided`, `expired`, `reversed`,
`failed`.

### 5.4 Both in one sale

Points spent and points earned are separate transactions. Authorize the
redemption, take payment, capture the redemption, then post the earn. The
customer receives one combined notification — we group them server-side.

---

## 6. Rewards

### 6.1 What can this customer use now

`POST /terminal/members/vouchers`

```json
{ "memberToken": "eyJ..." }
```

```json
[
  { "code": "7QX4M2", "rewardName": "Free coffee", "discountMinor": 1800,
    "expiresAt": "2026-09-01T00:00:00.000Z" }
]
```

Only rewards that are usable right now. Showing the cashier this list is faster
and far more reliable than asking the customer to find a code.

### 6.2 Apply one

`POST /terminal/vouchers/redeem`

```json
{ "code": "7QX4M2", "memberToken": "eyJ..." }
```

```json
{ "code": "7QX4M2", "status": "reserved", "rewardName": "Free coffee", "discountMinor": 1800 }
```

Codes are case-insensitive. Passing `memberToken` is optional but recommended —
it makes us verify the voucher belongs to the customer in front of you.

**`reserved` is a hold, not a spend.** It is confirmed when the sale captures,
and released automatically if the sale is abandoned — after 15 minutes at the
latest. Apply the `discountMinor` to the bill yourself; we do not price your
cart.

**One reward per sale.** A second redemption while another is held returns `400`.

Common `400` messages, all safe to show: `This voucher was already used`,
`This voucher was already used on a sale in progress`,
`This voucher belongs to a different member`.

---

## 7. Configuration

`GET /terminal/config`

Call at start of day and cache. It tells you what the brand calls its points and
how points convert to money.

```json
{
  "brand": { "name": "Camel Bean", "currency": "AED", "pointsCurrencyCode": "BEANS", "branding": {} },
  "terminal": { "label": "Till 2", "branchName": "JLT" },
  "redemption": {
    "enabled": true,
    "configured": true,
    "ratePoints": "100",
    "rateValueMinor": "100",
    "minRedeemPoints": "200",
    "maxPercentOfBillBps": 5000,
    "roundToMinor": 25,
    "presetsPoints": [500, 1000]
  }
}
```

**Use `pointsCurrencyCode` in your UI.** Brands name their own points and
"BEANS" on the receipt is worth more than "points".

### 7.1 The valuation rule

If you show a discount before calling `/quotes`, compute it exactly as we do or
your figure will disagree with the receipt:

1. `value = floor(points × rateValueMinor ÷ ratePoints)`
2. Round **down** to the nearest `roundToMinor`.
3. Cap at `amountMinor × maxPercentOfBillBps ÷ 10000`.

Never round up. `minRedeemPoints` is the floor below which redemption is refused.

---

## 8. Receipts

`POST /terminal/receipts`

Optional, and worth doing. It backs the QR code you print, giving the customer a
digital copy and emailing it when we hold an address.

```json
{
  "token": "<uuid you generate>",
  "kind": "sale",
  "orderNo": "ORDER-10482",
  "grossMinor": 2450,
  "discountMinor": 500,
  "netMinor": 1950,
  "currency": "AED",
  "paymentMethod": "card",
  "maskedPan": "•••• 4242",
  "authNo": "004821",
  "memberName": "Maya Khoury",
  "earnedPoints": 48,
  "redeemedPoints": 500,
  "balanceAfter": 698,
  "pointsCode": "BEANS",
  "memberToken": "eyJ...",
  "bonuses": [{ "name": "Happy Hour", "factor": 2 }]
}
```

Idempotent by `token`. Generate the token **before** you print, so the printed QR
is valid even if this call is queued and replayed later.

The customer-facing page is `https://api.partnerspoints.ae/v1/r/<token>` — that
is what the QR should encode.

Passing `memberToken` lets us attach the rewards used and any card completed to
the digital receipt, so it matches the paper one.

---

## 9. Offline

Tills lose connectivity. The rule is simple: **never block a sale on us.** Take
the payment, queue the loyalty call, replay it later.

`POST /terminal/transactions/batch`

```json
{
  "operations": [
    { "intent": "earn", "memberToken": "eyJ...", "idempotencyKey": "<uuid>", "amountMinor": 2450, "isVisit": true },
    { "intent": "earn", "memberToken": "eyJ...", "idempotencyKey": "<uuid>", "amountMinor": 900,  "isVisit": true }
  ]
}
```

```json
{
  "results": [
    { "idempotencyKey": "…", "ok": true, "result": { "id": "…", "state": "captured", "points": "48" } },
    { "idempotencyKey": "…", "ok": false, "error": "invalid or expired member token" }
  ]
}
```

The batch always returns `200`. **Inspect every element** — one failure does not
fail the others, and a failed element stays your responsibility.

Two constraints shape how you queue:

- **Member tokens expire in 10 minutes**, so a token captured offline is usually
  dead by the time you replay. Queue the **identifier** (phone or scanned code),
  then resolve it fresh at replay time and substitute the new token.
- **Generate the idempotency key when the sale happens**, not at replay. That is
  what makes replaying a queue twice harmless.

Redemptions should not be queued. Points you cannot verify are points you may not
have — take payment in full and let the customer redeem next visit.

---

## 10. Suggested integration order

1. Sign `GET /terminal/diagnostics/ping` until it returns `200`.
2. `GET /terminal/config`, cache it, use `pointsCurrencyCode` in your UI.
3. Resolve → context → display balance and stamp progress.
4. Earn on completed sales, with a per-sale idempotency key.
5. Enrolment for unrecognised phone numbers.
6. Rewards: list, apply, and make sure every authorize reaches capture or void.
7. Offline queue and replay.
8. Receipts.

Steps 1–4 are a working integration. The rest can follow.

---

## 11. Checklist before going live

- [ ] Signing verified against `/diagnostics/ping`, including a request with a body.
- [ ] Till clocks synchronised (NTP). Skew is ±5 minutes.
- [ ] The signing secret is not in source control, logs, or crash reports.
- [ ] One idempotency key per sale, reused on retry, generated at sale time.
- [ ] Every `authorize` provably reaches `capture` or `void`, including after a crash.
- [ ] Timeouts resolved with `GET /terminal/transactions/{id}`, never assumed.
- [ ] Balances handled as strings or big integers, never JS `number`.
- [ ] A loyalty failure never blocks a payment.
- [ ] Batch results inspected element by element.
- [ ] `requestId` captured from error responses into your logs.

---

## 12. Support

Integration questions: **help@partnerspoints.ae** — include the `requestId` and
your publishable key id (never the secret).

Credentials are issued per terminal by the Partners Points team.

**Rotating a secret is currently a cutover, not an overlap.** Exactly one secret
is valid at a time, so the old one stops working the moment the new one is
issued. Plan a rotation as a brief coordinated switch per terminal, and tell us
before you need one so we can schedule it with you.
