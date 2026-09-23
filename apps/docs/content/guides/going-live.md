---
title: Going live
description: The order to build in, and the checklist a register must pass before it touches a real balance.
---

## Build order

1. Sign `GET /terminal/diagnostics/ping` until it returns `200`.
2. `GET /terminal/config`, cache it, use `pointsCurrencyCode` in your UI.
3. Resolve → context → display balance and stamp progress.
4. Earn on completed sales, with a per-sale idempotency key.
5. Enrolment for unrecognised phone numbers.
6. Rewards: list, apply, and make sure every authorize reaches capture or void.
7. Offline queue and replay.
8. Receipts.

Steps 1 to 4 are a working integration. The rest can follow.

## Checklist

- [ ] Signing verified against `/terminal/diagnostics/ping`, including a request with a body.
- [ ] Register clocks synchronised (NTP). Skew allowance is ±5 minutes.
- [ ] The signing secret is not in source control, logs, or crash reports.
- [ ] One idempotency key per sale, reused on retry, generated at sale time.
- [ ] Every `authorize` provably reaches `capture` or `void`, including after a crash.
- [ ] Timeouts resolved with `GET /terminal/transactions/{id}`, never assumed.
- [ ] Balances handled as strings or big integers, never a JavaScript `number`.
- [ ] Money sent as integer minor units. No decimals anywhere.
- [ ] A loyalty failure never blocks a payment.
- [ ] Batch results inspected element by element.
- [ ] `requestId` captured from error responses into your logs.
- [ ] `bonuses`, `completed` and `stamps` printed on the receipt.
- [ ] The brand’s `pointsCurrencyCode` used instead of the word “points”.

## Credentials

Test credentials are scoped to a test brand: real API, real behaviour, no real customers. Build and certify against them.

Production credentials are issued per register by Partners Points when you go live. Each register has its own key pair; a key that is re-issued revokes the previous one immediately.

## Environments

There is one API host, `https://api.partnerspoints.ae/v1`, for both test and production. The credential decides which brand your calls land in.
