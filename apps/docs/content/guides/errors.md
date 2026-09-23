---
title: Errors
description: One envelope for every failure, a code to branch on, and a message safe to show the cashier.
---

## The envelope

Every failure returns the same shape with the matching HTTP status:

```json
{
  "error": {
    "code": "validation_error",
    "message": "phone must be E.164 (+9715xxxxxxxx)",
    "requestId": "3f9a1c7e-6d2b-4e1f-9a8c-7b6d5e4f3a2b"
  }
}
```

`code` is what you branch on. `message` is written to be shown to a cashier, and is safe to display. Do not parse `message`; its wording may change, `code` will not.

## Codes

| Status | `code` | Meaning |
|---|---|---|
| 400 | `validation_error` | The request is malformed, or the operation is not valid in the current state. `message` says which. |
| 401 | `unauthorized` | Signature, timestamp, nonce or key problem. See [Authentication](/authentication). |
| 403 | `forbidden` | The key is not permitted to do this. |
| 404 | `not_found` | No such member, transaction or voucher **for this brand**. |
| 409 | `conflict` | The change was queued for approval rather than applied. Not raised by the terminal endpoints today. |
| 429 | `rate_limited` | Back off and retry. Terminal endpoints are exempt from IP rate limiting, so you should not see this. |
| 500 | `internal_error` | Our fault. Retry with the same idempotency key. |

## Messages you will see

These `400` messages come up in normal operation and are all safe to show:

| Message | From | What to do |
|---|---|---|
| `invalid or expired member token` | Any member call | Resolve the customer again. Tokens last 10 minutes. |
| `phone must be E.164 (+9715xxxxxxxx)` | Enrol | Fix the number format. |
| `insufficient points` | Create a transaction (redeem) | Offer a smaller amount; quote first to avoid this. |
| `redeem requires points > 0` | Create a transaction (redeem) | Send `points`. |
| `cannot capture in state <state>` | Capture | The hold is not `authorized`. Get the transaction and act on its real state. |
| `cannot void in state <state>` | Void | Same as above. |
| `This voucher has expired` | Redeem a voucher | Tell the customer. |
| `This voucher was already used` | Redeem a voucher | Tell the customer. |
| `This voucher was already used on a sale in progress` | Redeem a voucher | Another till holds it. Wait or void that sale. |
| `This voucher belongs to a different member` | Redeem a voucher | The code and the identified member do not match. |
| `Only one reward can be used per sale — <reward> is already applied` | Redeem a voucher | Rewards do not stack. |

## Request ids

**Quote `requestId` in any support conversation.** It identifies the exact request in our logs. Capture it from every error response into your own logs; it is the fastest way to resolve an integration question.

## Timeouts are not errors

A timeout means you do not know what happened. Never assume. For a transaction, retry with the **same** idempotency key, or poll [Get a transaction](/reference/get-transaction) for the definitive state. See [Idempotency and retries](/idempotency).
