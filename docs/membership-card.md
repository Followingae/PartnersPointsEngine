# Membership card — load & spend

An optional mode a brand can run instead of, or alongside, an ordinary loyalty
card. On a loyalty card points arrive as a thank-you for money spent elsewhere.
On a membership card **the points are the money**: a member buys them at a
counter and hands them over to pay.

Nothing about it is specific to one kind of business. A leisure venue whose
stalls are branches, a campus, a members' club, a chain selling prepaid credit —
all the same two movements.

## What a brand needs to run one

No new data model. The existing shape already carries it:

| Requirement | Satisfied by |
|---|---|
| One balance per member | One `CustomerMembership` → one ledger account |
| Every location draws on it | Each branch has its own terminal credentials |
| Who spent what, where | `journal.branch_id`, surfaced by `AnalyticsService.byBranch` |
| Points expire | The expiry sweep, unchanged |

The one structural decision a brand has to get right: **the locations that take
payment must be branches of one brand, not brands of their own.** A brand per
location gives each one its own balance, which is the opposite of the point.

## The two intents

Both live in `packages/db/src/ledger/operations.ts` and post through the same
double-entry engine as everything else, so outstanding liability stays provable
from the ledger alone. Both are idempotent on `(actorId, key)`.

### `loadPoints` — staff sell points

Credits the member. Carries `amountPaidMinor`, the money the terminal's own
payment flow took, so the till reconciles at close.

Debits **`points_sold`**, a new account type — not `points_expense`. An earn
costs the brand something; a load was paid for. Booking a sold point as an
expense would understate what the counter took, overstate what the programme
cost, and leave the outstanding liability unable to say how much of it was
bought.

### `spendPoints` — a branch charges points

Debits the member, attributed to the branch that charged, credited to
`points_revenue`. Single-step — no authorize/capture pair, because there is
nothing to hold: the customer is at the till and the transaction is over before
they walk away.

Fails when the balance is short. The overdraw guard in `applyPosted` is what
makes that true rather than hoped for; no branch can push a member negative,
however many devices charge at once.

**Earning back on a spend is not done here.** What a spend earns is a question
for the brand's earn rules, which live a layer up. The caller posts an
`earnPoints` alongside the spend *in the same transaction* — a charge that took
points and failed to give any back is a customer complaint, not a state the
ledger should be able to reach.

## What it changes elsewhere

- `journal_kind` and `terminal_intent` gain `load` and `spend`
  (`2026-08-06_membership_load_spend.sql`, additive — nothing to backfill).
- Customer activity renders them as *Points loaded* and *Points spent*, and every
  event now names the branch it happened at.
- `byBranch` reports `loaded` and `spent` columns alongside earned/redeemed. The
  brand console shows them only for brands that have some, so an ordinary
  brand's table is unchanged.

## Not built

- **A staff-facing app.** Locations with phones rather than terminals cannot use
  the POS HMAC auth — that means a signing secret in a browser. It needs
  session-based staff login: accounts scoped to one branch. Nothing in the
  platform has that surface yet.
- **A per-location view.** `byBranch` is the brand's view of every branch. An
  operator seeing only their own needs the staff accounts above.
- **A console module** for load history, grants and liability. The reporting
  screens cover it for now.

## Undecided

Two questions nobody has ruled on, both cheap now and expensive once a staff app
exists:

- Whether loaded and earned points expire on the same clock. They are one
  balance everywhere else; two expiry schedules would be the first place that
  stops being true.
- Whether a location may reverse its own charge within some window, given there
  is no refund path out of points. Likely yes, as a same-session void — the
  authorize/capture/void mechanism already exists to build it on.
