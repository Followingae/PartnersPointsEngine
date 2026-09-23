---
title: Idempotency and retries
description: How to retry safely so a timeout can never double-award or double-charge.
---

## The rule

Generate **one idempotency key per sale**, at the moment the sale happens, and reuse it on every retry of that sale. A repeat of [Create a transaction](/reference/create-transaction) with the same `idempotencyKey` returns the original transaction and awards nothing further.

Keys are scoped to your register, so they only need to be unique to you. A UUID v4 is the right choice.

## What a replay returns

A replayed create returns the seven transaction fields of the original (`id`, `intent`, `state`, `points`, `amountMinor`, `authJournalId`, `captureJournalId`). It does **not** include `completed`, `stamps` or `bonuses`, because those describe the moment of the original sale. If you need them for the receipt, keep the first response.

## Capture and void

Capture and void take no body and no key. They are safe to retry because they only move a transaction out of `authorized` once. A second capture returns `400 cannot capture in state captured`; treat that as “already done” after confirming with [Get a transaction](/reference/get-transaction).

## After a timeout

1. Retry the same request with the same `idempotencyKey`, a **new** `ts` and a **new** `nonce`. The signature changes because the timestamp is signed.
2. If it still fails, poll `GET /terminal/transactions/{id}` if you have an id, or keep the operation queued and replay it later with [the batch endpoint](/reference/batch-transactions).
3. Never generate a fresh key for a retry. That is how a customer gets paid twice.

## Receipts

[Create a receipt](/reference/create-receipt) is idempotent by `token`. Generate the token before you print so the QR is valid even if the call is queued and replayed later.

## Vouchers

[Redeem a voucher](/reference/redeem-voucher) is a hold, not a spend, and holds expire after 15 minutes if the sale never completes. Retrying it returns `This voucher was already used on a sale in progress` while your own hold is live; that is expected, the reward is still applied.
