---
title: Introduction
description: What the POS Integration API does, how it is shaped, and the four ideas you need before the first call.
---

## What this API is for

Partners Points runs loyalty for brands. A customer joins a brand, earns points on purchases, collects stamps, and spends points or rewards at the counter. This API is the surface a point of sale uses to take part in that: it identifies the customer, awards points for a sale, applies rewards, and stores the receipt.

It is deliberately small. Fourteen endpoints, one authentication scheme, one error envelope. A working integration is four calls: verify signing, read the configuration, identify a customer, award points. Everything else can follow.

## Base URL and format

| | |
|---|---|
| **Base URL** | `https://api.partnerspoints.ae/v1` |
| **Paths** | Written relative to the base. `/terminal/quotes` means `https://api.partnerspoints.ae/v1/terminal/quotes`. |
| **Content type** | `application/json` on every request with a body. |
| **Encoding** | UTF-8. |
| **Success codes** | `GET` returns `200`. A successful `POST` returns `201`. Branch on the 2xx class, not the exact number. |

## Four ideas

**Points are per brand.** A customer holds a separate balance at every brand they have joined. Your credentials are issued against one brand and one register, so every call is implicitly scoped. You never pass a brand id.

**Money is in minor units.** `amountMinor: 2450` is AED 24.50. There are no decimals anywhere in this API. Points are whole integers, and balances come back as **decimal strings** because they are 64-bit integers that overflow a JavaScript `number` at scale. Parse them as big integers.

**A member token identifies a customer for one transaction.** You resolve a phone number or scanned code into a short-lived opaque token, then pass that token to everything else. The token expires after **10 minutes**. Resolve at the start of a sale, not at the start of a shift.

**Earning is one step; redeeming is two.** Awarding points happens immediately. Spending points is authorize, then capture: the points are held while the card payment goes through and released automatically if it fails.

## The endpoints at a glance

| Group | Endpoints |
|---|---|
| Diagnostics | `GET /terminal/diagnostics/ping` |
| Configuration | `GET /terminal/config` |
| Members | `POST /terminal/members/resolve` · `POST /terminal/members/enroll` · `POST /terminal/members/context` |
| Sales | `POST /terminal/quotes` · `POST /terminal/transactions` · `POST /terminal/transactions/{id}/capture` · `POST /terminal/transactions/{id}/void` · `GET /terminal/transactions/{id}` · `POST /terminal/transactions/batch` |
| Rewards | `POST /terminal/members/vouchers` · `POST /terminal/vouchers/redeem` |
| Receipts | `POST /terminal/receipts` |

Each one is documented in full under [API reference](/reference), with request fields, response fields, examples and every error it returns. An [OpenAPI 3 document](/openapi.json) describes the same surface for client generation.

## What you are given

Two values per register, issued by Partners Points:

| Value | Example | Handling |
|---|---|---|
| Publishable key id | `pk_9dK2mQ7xR4vN8bTz` | Sent in the clear on every request. |
| Signing secret | `sk_Lp3wQ8nH2vX…` | Never transmitted. Store it where your card keys live. |

Test credentials are scoped to a test brand, so nothing you do while building touches a real balance. Production credentials are issued per register when you go live.
