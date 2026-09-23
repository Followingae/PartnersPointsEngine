---
title: Configuration and valuation
description: What to read at start of day, and the exact rule that turns points into a discount.
---

## Read at start of day

[`GET /terminal/config`](/reference/config) returns the brand identity and the redemption valuation. Call it on boot, cache it, and refresh daily.

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

**Use `pointsCurrencyCode` in your UI.** Brands name their own points, and “BEANS” on the receipt is worth more than “points”.

**`configured: false`** means the brand has not set a valuation yet and defaults are being returned. Treat redemption as unavailable until it is `true`.

## The valuation rule

If you show a discount before calling the quote, compute it exactly as the server does:

1. `value = floor(points × rateValueMinor ÷ ratePoints)`
2. Round **down** to the nearest `roundToMinor`.
3. Cap at `floor(amountMinor × maxPercentOfBillBps ÷ 10000)`.

Never round up. `minRedeemPoints` is the floor below which redemption is refused. When `enabled` is `false` the value is always zero.

### Worked example

With the configuration above and a bill of AED 24.50 (`amountMinor: 2450`), spending 500 points:

| Step | Calculation | Result |
|---|---|---|
| Rate | 500 × 100 ÷ 100 | 500 |
| Round down to 25 | floor(500 ÷ 25) × 25 | 500 |
| Cap at 50% of bill | 2450 × 5000 ÷ 10000 = 1225 | 500 (under cap) |

The discount is AED 5.00. Spending 2000 points on the same bill would be worth 2000 before the cap and **1225** after it, so the customer should be offered at most the points that reach the cap.

## Presets

`presetsPoints` are amounts the brand suggests as quick buttons. Offer them, filtered to what the member can afford and what is at or above `minRedeemPoints`.

## Branding

`brand.branding` carries white-label theming when the brand has set it, such as a logo URL and primary colour. It may be an empty object. Use it if your screens can be themed; ignore it otherwise.
