---
title: Offline and replay
description: Never block a sale on loyalty. Queue the call, take the payment, replay it later.
---

## The rule

Registers lose connectivity. When yours does, **take the payment, queue the loyalty operation, and replay it when the network returns.** A loyalty failure must never stop a customer paying.

## What to queue

Queue **earns**. Each queued operation is the body you would have sent to [Create a transaction](/reference/create-transaction), with two adjustments:

1. **Generate the idempotency key when the sale happens**, not at replay. That is what makes replaying a queue twice harmless.
2. **Queue the identifier, not the token.** Member tokens expire in 10 minutes, so a token captured offline is usually dead by the time you replay. Store the phone number or scanned code, resolve it fresh at replay time, and substitute the new token.

Queue **receipts** too. Their token is generated before printing, so a replayed receipt is exact.

## What not to queue

**Do not queue redemptions.** Points you cannot verify are points the customer may not have. Take payment in full and let the customer redeem next visit. The same goes for voucher redemptions.

## Replay

[`POST /terminal/transactions/batch`](/reference/batch-transactions) takes up to 200 operations and processes each independently.

```json
{
  "operations": [
    { "intent": "earn", "memberToken": "eyJ…", "idempotencyKey": "4f6a1c2e-…", "amountMinor": 2450, "isVisit": true },
    { "intent": "earn", "memberToken": "eyJ…", "idempotencyKey": "9b3d7e1f-…", "amountMinor": 900, "isVisit": true }
  ]
}
```

```json
{
  "results": [
    { "idempotencyKey": "4f6a1c2e-…", "ok": true, "result": { "id": "…", "state": "captured", "points": "48", "…": "…" } },
    { "idempotencyKey": "9b3d7e1f-…", "ok": false, "error": "invalid or expired member token" }
  ]
}
```

The call succeeds as a whole. **Inspect every element.** One failure does not fail the others, and a failed element stays your responsibility: fix the cause (usually a stale token), and replay it in the next batch. Operations that already went through are deduplicated by their idempotency key and return `ok: true` with the original transaction.

## Single retries

If a single online call times out, you do not need the batch endpoint. Retry [Create a transaction](/reference/create-transaction) with the same idempotency key, or poll [Get a transaction](/reference/get-transaction). See [Idempotency and retries](/idempotency).

## Suggested queue design

- Persist the queue to disk before confirming the sale to the cashier.
- Store per entry: idempotency key, identifier type and value, amount, visit flag, items, source event, and the receipt token if any.
- Replay in order, at most 200 per call, and remove an entry only when its result is `ok: true` or its error is permanent (for example a member that no longer exists).
- Alert staff if an entry has failed more than a few times.
