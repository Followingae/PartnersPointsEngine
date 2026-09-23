---
title: Quickstart
description: A working integration in four calls. Each step links to the full reference for the endpoint it uses.
---

## 1. Sign a request

Every call to `/terminal/*` carries an HMAC-SHA256 signature in the `Authorization` header. Implement the signing function from [Authentication](/authentication), then call the ping endpoint until it returns `200`:

```http
GET https://api.partnerspoints.ae/v1/terminal/diagnostics/ping
Authorization: Loyalty-HMAC publishableKeyId=pk_9dK2mQ7xR4vN8bTz,ts=1758627600,nonce=5f1c…,sig=9a3e…
```

```json
{
  "ok": true,
  "brandId": "019fc6d1-…",
  "actor": { "type": "terminal", "id": "019fc6d1-…", "onBehalfOf": null }
}
```

A `401` here means the signature is wrong. The most common causes, in order: signing the path without `/v1`; including the query string; re-serializing the body after hashing; milliseconds instead of seconds in `ts`.

## 2. Read the configuration

Once per day, and cache it. It tells you what the brand calls its points and how points convert to money.

```http
GET https://api.partnerspoints.ae/v1/terminal/config
```

Use `brand.pointsCurrencyCode` wherever your UI would say “points”. Keep `redemption` for the valuation rule in [Configuration and valuation](/configuration). Full response under [Get configuration](/reference/config).

## 3. Identify the customer

Resolve a phone number or scanned code into a member token, then fetch what the cashier should see.

```http
POST https://api.partnerspoints.ae/v1/terminal/members/resolve
Content-Type: application/json

{ "type": "phone", "value": "+971501234567" }
```

```json
{ "memberToken": "eyJhbGciOi…" }
```

```http
POST https://api.partnerspoints.ae/v1/terminal/members/context
Content-Type: application/json

{ "memberToken": "eyJhbGciOi…" }
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

A `404` on resolve means this brand has no such member. Offer to [enrol them](/reference/enroll-member) with their phone number; it takes one call and returns a token straight away.

## 4. Award points

When the sale completes, post an earn. Generate one UUID per sale as the idempotency key and reuse it on every retry of that sale.

```http
POST https://api.partnerspoints.ae/v1/terminal/transactions
Content-Type: application/json

{
  "intent": "earn",
  "memberToken": "eyJhbGciOi…",
  "idempotencyKey": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "amountMinor": 2450,
  "isVisit": true,
  "sourceEvent": "ORDER-10482"
}
```

```json
{
  "id": "019fc6f5-…",
  "intent": "earn",
  "state": "captured",
  "points": "48",
  "amountMinor": "2450",
  "authJournalId": null,
  "captureJournalId": "019fc6f5-…",
  "completed": [],
  "stamps": [{ "id": "…", "name": "Coffee card", "progress": 9, "target": 10, "completions": 0 }],
  "bonuses": [{ "id": "…", "name": "Happy Hour", "factor": 2 }]
}
```

Print `points`, name every entry in `bonuses`, and when a `stamps` entry has `justCompleted: true` or `completed` is non-empty, print the reward prominently. That is the whole loop.

## What to add next

1. **Redeem points** with authorize, capture and void. [Take a sale](/take-a-sale).
2. **Rewards**: list what a member can use and apply one to the bill. [Rewards and vouchers](/rewards).
3. **Offline** queueing and batch replay. [Offline and replay](/offline).
4. **Receipts** behind the QR you print. [Receipts](/receipts).
5. Run the [go-live checklist](/going-live).
