---
title: Rewards and vouchers
description: Show the cashier what a member can use right now, apply one to the bill, and understand when it is actually spent.
---

## Points and rewards are different things

Points are a balance the customer spends at the valuation rate. Rewards are specific things, such as a free coffee or AED 18 off, issued as **vouchers** with a code. A customer earns vouchers by completing stamp cards and challenges, or by converting points in their app. At the till you apply a voucher by its code.

## What can this customer use now

[`POST /terminal/members/vouchers`](/reference/member-vouchers) lists only rewards that are usable at this moment.

```json
{ "memberToken": "eyJ…" }
```

```json
[
  { "code": "7QX4M2", "rewardName": "Free coffee", "kind": "voucher", "discountMinor": 1800, "expiresAt": "2026-09-01T00:00:00.000Z" }
]
```

Showing the cashier this list is faster and far more reliable than asking the customer to find a code. Holds left by abandoned sales are released before the list is built, so what you see is what can be applied.

## Apply one

[`POST /terminal/vouchers/redeem`](/reference/redeem-voucher).

```json
{ "code": "7QX4M2", "memberToken": "eyJ…" }
```

```json
{ "code": "7QX4M2", "status": "reserved", "rewardName": "Free coffee", "kind": "voucher", "discountMinor": 1800 }
```

Codes are case-insensitive. `memberToken` is optional but recommended: it makes the server verify the voucher belongs to the customer in front of you.

Apply `discountMinor` to the bill yourself. The API does not price your cart.

## `reserved` is a hold, not a spend

The reward is held for this sale. It becomes spent when the sale completes, which happens on either of:

- an **earn** transaction for this member, or
- a **capture** of a redeem transaction for this member.

If neither happens, the hold is released automatically after 15 minutes at the latest, and immediately if you void a redeem for this member. An abandoned sale spends nothing.

## One reward per sale

Rewards do not stack. Applying a second voucher while another is held returns `400 Only one reward can be used per sale — Free coffee is already applied`. The message is safe to show.

## Messages to expect

All of these are `400` with a message written for the cashier:

- `This voucher has expired`
- `This voucher was already used`
- `This voucher was already used on a sale in progress`
- `This voucher belongs to a different member`

A code that does not exist at this brand returns `404`.

## On the receipt

If you pass `memberToken` to [Create a receipt](/reference/create-receipt), the rewards applied to the sale and any stamp card completed are attached to the digital receipt automatically. You do not need to send them.
