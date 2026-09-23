---
title: Receipts
description: Give the customer a digital copy behind the QR you print, and let the server attach the rewards and stamps for you.
---

## What it does

[`POST /terminal/receipts`](/reference/create-receipt) stores a copy of the sale that the customer can open from a QR code on the paper receipt. If Partners Points holds an email address for the member, the receipt is also emailed.

The customer-facing page is:

```text
https://api.partnerspoints.ae/v1/r/<token>
```

That URL is what the QR should encode.

## Generate the token before you print

`token` is yours to generate, an unguessable UUID. Generate it **before** you print, so the printed QR is valid even if the call is queued during an outage and replayed later. The call is idempotent by token: replaying it returns the same `{ id, token }` and stores nothing twice.

## What to send

```json
{
  "token": "2d1c9a3e-5f4b-4a8c-9d7e-1b2c3d4e5f6a",
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
  "memberToken": "eyJ…",
  "bonuses": [{ "name": "Happy Hour", "factor": 2 }]
}
```

Only `token` and `orderNo` are required. Send what you print.

**`memberToken`** lets the server attach the rewards applied to this sale and any stamp card completed, so the digital receipt matches the paper one. You do not send those yourself.

**`bonuses`** is echoed from the transaction response. It makes a happy hour visible on the receipt rather than being a bigger number with no explanation.

**`kind`** is `sale`, `refund` or `void`. Defaults to `sale`.

## Response

```json
{ "id": "019fc700-…", "token": "2d1c9a3e-5f4b-4a8c-9d7e-1b2c3d4e5f6a" }
```
