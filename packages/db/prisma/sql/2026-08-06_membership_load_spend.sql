-- The two intents a membership card needs that a loyalty card never did.
--
-- On a loyalty card, points arrive as a thank-you for money spent elsewhere. On
-- a membership card the points *are* the money: a member buys them at a counter
-- and hands them over to pay. Neither movement is an earn or a redemption — an
-- `earn` is points given away against a purchase made in cash, and a
-- `redeem_capture` is points traded for a reward. Points sold for cash, and
-- points handed over as the payment itself, are different events with different
-- reporting: "how much did the counter take today" and "what did this location
-- collect" are questions the existing kinds cannot answer without lying about
-- what happened.
--
-- So they get their own kinds rather than being squeezed into the nearest one.
-- The alternative — tagging earns with a source_event string and grouping on it
-- — puts the meaning of a financial record in free text, which is exactly the
-- thing a typed ledger exists to avoid.
--
-- Additive only. Existing values are untouched, so every journal already
-- written keeps its meaning and nothing needs backfilling.

ALTER TYPE "journal_kind" ADD VALUE IF NOT EXISTS 'load';
ALTER TYPE "journal_kind" ADD VALUE IF NOT EXISTS 'spend';

-- The same two intents on the terminal side. A load carries the money taken
-- (`amount_minor`) so the till reconciles against the day's cash, and a spend
-- carries the branch that charged — which is the whole of the per-location
-- report a brand owes whoever operates that location.
ALTER TYPE "terminal_intent" ADD VALUE IF NOT EXISTS 'load';
ALTER TYPE "terminal_intent" ADD VALUE IF NOT EXISTS 'spend';
