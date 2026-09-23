---
title: Take a sale
description: Quote, award, and spend points, with the authorize-capture-void flow that keeps a failed card payment from stranding a hold.
---

## Quote first (optional, changes nothing)

[`POST /terminal/quotes`](/reference/quote) previews what a sale will award and what a redemption is worth.

```json
{
  "memberToken": "eyJ…",
  "amountMinor": 2450,
  "isVisit": true,
  "redeemPoints": 500
}
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
    "valueMinor": "500",
    "belowMinimum": false
  }
}
```

Show `bonuses` to the customer. A doubled figure with nothing beside it looks identical to a promotion that failed to run.

A quote is a preview and can go stale: an hour can end between quoting and charging. The transaction response is authoritative.

### Line items

If the brand runs product-specific earn rules, send the cart as `items`, each a SKU and a quantity. The same field is accepted on the transaction.

```json
{
  "memberToken": "eyJ…",
  "amountMinor": 2450,
  "isVisit": true,
  "items": [
    { "sku": "LATTE-L", "qty": 2 },
    { "sku": "CROISSANT", "qty": 1 }
  ]
}
```

Brands that only run amount-based or visit-based rules ignore it.

## Award points

[`POST /terminal/transactions`](/reference/create-transaction) with `intent: "earn"`.

```json
{
  "intent": "earn",
  "memberToken": "eyJ…",
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
  "completed": [
    { "id": "…", "name": "Coffee card", "kind": "visits", "rewardPoints": "0", "badgeName": "Free coffee · CODE 7QX4M2", "rewardName": "Free coffee", "voucherCode": "7QX4M2" }
  ],
  "stamps": [{ "id": "…", "name": "Coffee card", "progress": 10, "target": 10, "completions": 1, "justCompleted": true }],
  "bonuses": [{ "id": "…", "name": "Happy Hour", "factor": 2 }]
}
```

**`idempotencyKey`**: one UUID per sale, generated when the sale happens, reused on every retry. A repeat returns the original and awards nothing further. This is your protection against double-awarding on a timeout.

**`completed` and `stamps` are the celebration.** When `justCompleted` is true the customer has just filled a card. Print `badgeName` prominently and say the reward name and code. A stamp card that fills silently is a stamp card the customer stops collecting.

**`isVisit`** counts the sale as a visit for stamp cards and visit-based rules. Send `true` for a normal in-person sale.

## Spend points: authorize, then capture

**Step 1. Hold the points** while you take payment.

```json
{ "intent": "redeem", "memberToken": "eyJ…", "idempotencyKey": "b1d4…", "points": 500 }
```

```json
{
  "id": "019fc7a2-…",
  "intent": "redeem",
  "state": "authorized",
  "points": "500",
  "amountMinor": null,
  "authJournalId": "019fc7a2-…",
  "captureJournalId": null
}
```

The customer’s available balance drops immediately. Nothing is spent yet. If the member cannot cover it, the call returns `400 insufficient points`; a quote beforehand avoids this.

**Step 2a. Payment succeeded.** [`POST /terminal/transactions/{id}/capture`](/reference/capture-transaction) → `state: "captured"`.

**Step 2b. Payment failed or the sale was abandoned.** [`POST /terminal/transactions/{id}/void`](/reference/void-transaction) → `state: "voided"`, points returned.

Capture and void take no body. Both are only valid from `authorized`; anything else returns `400` naming the current state.

> **Always call one of them.** An authorization left open holds the customer’s points. Void is the correct call whenever the sale does not complete, including when your own process crashed and you found the hold on restart.

**Step 3. If you are unsure what happened**, [`GET /terminal/transactions/{id}`](/reference/get-transaction) returns the definitive state. Use it after a timeout rather than guessing.

### Transaction states

| State | Meaning |
|---|---|
| `authorized` | Redeem hold placed. Capture or void it. |
| `captured` | Points posted. Final. |
| `voided` | Hold released. Final. |
| `pending` | Reserved for future use. Not returned today. |
| `expired`, `reversed`, `failed` | Terminal states reserved for operational tooling. Treat as “not captured”. |

## Both in one sale

Points spent and points earned are separate transactions. The order:

1. Authorize the redemption.
2. Take payment for the reduced amount.
3. Capture the redemption.
4. Post the earn for the sale.

The customer receives one combined notification; the transactions are grouped server-side. Earn on the full or the reduced amount according to the brand’s policy; ask Partners Points if unsure.

## The discount value

Convert points to money exactly as the server does, or your figure will disagree with the receipt. The rule and the numbers it uses are under [Configuration and valuation](/configuration). The quote does this for you.
