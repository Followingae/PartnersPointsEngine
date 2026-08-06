# Happy Land — Membership Card module

Design, decided. Everything here is settled unless marked otherwise.

Happy Land Recreational Services is a family entertainment centre. Customers
load Points at the entrance, spend them at stalls inside, earn Points on what
they spend, and redeem on the rides.

---

## The one structural decision

**Happy Land is a Brand. Each stall is a Branch.**

That is the whole trick, and it is why this needs almost no new data model:

| Requirement | Already satisfied by |
|---|---|
| One balance per customer | One `CustomerMembership` → one ledger account |
| Every stall earns into it | Each branch gets its own terminal credentials |
| Redeemed on the rides | Rides are a branch; redemption exists |
| Who spent what, where | `AnalyticsService.byBranch` |
| Points expire | The expiry sweep, unchanged |

Do not model stalls as separate brands. That gives every stall its own balance,
which is the opposite of the proposition.

## Happy Land is the sole merchant

Decided, and load-bearing. The customer transacts with Happy Land; stalls are
concessions. Happy Land settles with them **manually, outside this system** —
so there is no payables ledger, no settlement engine, no per-transaction
liability to a third party.

Stalls need *visibility*, not money movement: what was spent, at which stall,
when. That is a report.

This also keeps the product closed-loop and single-merchant, which is what
keeps it out of stored-value territory. Two rules follow from it and both are
technical:

- **No refund path.** Points buy entertainment and never convert back to cash.
  Staff goodwill is a Points *grant*, not a refund. Do not add a refund intent.
- **Points work only inside Happy Land.** True by construction when the venue
  is one brand.

---

## What is genuinely new

Two ledger intents. Everything else exists.

### `load` — staff sells Points

Runs on Happy Land's own payment terminals at the entrance. Money is taken by
the terminal's existing payment flow; this records the Points.

- Credits the member's balance.
- Carries the amount paid, for reconciliation against the till.
- Subject to expiry like any other Points.

### `spend` — a stall charges Points

- Debits the member's balance, attributed to the **branch** that charged.
- Fails when the balance is short. No overdraft, no negative balances.
- **Earns Points back on the spend**, per the brand's existing earn rules —
  decided: loaded Points and earned Points are one balance and behave
  identically.

Both go through the existing double-entry engine so balances stay provable, and
both must be idempotent on `(actorId, idempotencyKey)` like every other terminal
transaction.

---

## Merchant Membership Business App

Stalls have phones, not terminals. This is a new mobile-first web app.

**It cannot use the POS API's HMAC auth.** That means a signing secret in a
browser, where anyone can read it. It needs session-based staff login — a new
auth surface: staff accounts scoped to one branch.

Scope:

- Sign in as stall staff
- Scan a customer's QR (their existing member code)
- See name and balance
- Charge Points → confirm → done
- Today's takings for this stall

Match the console UI standards. Mobile-first: this is used one-handed at a stall.

---

## Superadmin and brand console

A Membership Card module in both. Brand-side is what Happy Land's own team uses.

- Stalls (branches): create, issue credentials, enable/disable
- Load history: who loaded, how much, at which terminal
- Spend by stall: the visibility stalls are owed, exportable as CSV
- Points liability outstanding, and what expires when
- Grants and adjustments, audited

---

## Customer app: unchanged

Deliberately. Loading happens at the entrance via staff, spending happens at
stalls via the merchant app. The customer only ever *sees* their card, which
already works — one Happy Land card, one balance, activity by stall.

Do not add screens to the customer app for this.

---

## Demo

Clickable, seeded. A Happy Land brand with named stalls as branches, customers
with balances and plausible history, enough to sell from.

Brand colours from the logo: navy `#1B2A5B`, red `#C8102E`, yellow `#FFC72C`.

---

## Build order

1. **Seeded demo structure** — brand, branches, customers, history. Days, not
   weeks, and it is what sells the deal.
2. **`load` and `spend` intents** — the ledger foundation everything else needs.
3. **Merchant app** — largest piece; do not start before 2 is settled or it gets
   built twice.
4. **Console modules** — reporting on top of data that exists by then.

## Still open

- Whether loaded Points and earned Points expire on the same schedule. They are
  one balance, but the expiry clock could differ; nobody has said.
- Whether a stall can reverse its own charge within some window, given there is
  no refund path. Likely yes as a same-session void, like the terminal's
  existing capture/void.
