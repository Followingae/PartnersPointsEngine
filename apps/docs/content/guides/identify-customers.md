---
title: Identify a customer
description: Resolve who is at the counter, enrol them if they are new, and show the cashier what matters.
---

## Resolve an existing customer

[`POST /terminal/members/resolve`](/reference/resolve-member) turns an identifier into a member token.

```json
{ "type": "phone", "value": "+971501234567" }
```

```json
{ "memberToken": "eyJhbGciOi…" }
```

`type` is one of `phone`, `email`, `qr`, `nfc`, `loyalty_id`, `card_token`. Use `qr` with the exact string scanned from the customer’s app; do not parse or trim it.

The token expires after **10 minutes**. Resolve when the customer arrives, not when the shift starts. If a call returns `invalid or expired member token`, resolve again.

`404` means this brand has no such member. Offer to enrol.

## Enrol at the till

[`POST /terminal/members/enroll`](/reference/enroll-member) creates a membership from a phone number.

```json
{ "phone": "+971509876543", "fullName": "Maya Khoury" }
```

```json
{ "memberToken": "eyJhbGciOi…", "created": true }
```

Phone must be E.164. The call is idempotent: a number that already exists resolves with `created: false`, so you can call it without checking first. The customer completes their profile later in the Partners Points app.

## Show the cashier who this is

[`POST /terminal/members/context`](/reference/member-context) returns the recognition screen.

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

**Balances are strings.** They are 64-bit integers and will overflow a JavaScript `number` at scale. Keep them as strings or parse to a big integer. `available` is what can be spent now; `pending` is held by open redemptions.

**Show `challenges`.** “Two more visits and your next coffee is free” is the single most effective thing a cashier can say, and this is the only moment they have the customer in front of them. When `unit` is `visits`, say “8 of 10 visits”. A brand with no challenges returns an empty list; show nothing, never a placeholder.

## Which identifier to prefer

| Situation | Use |
|---|---|
| Customer opens the app and shows a code | `qr` with the scanned string |
| Customer taps a card or phone | `nfc` or `card_token` |
| Customer says a phone number | `phone` in E.164 |
| Customer reads their id from a receipt | `loyalty_id`, e.g. `PP-4X7K2M` |
