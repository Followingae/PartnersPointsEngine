-- Name the campaign that made an earn bigger, on the receipt.
--
-- Happy hours and campaign boosts have always been applied correctly — the rule
-- engine multiplies, and the points that land are the doubled ones. What was
-- missing is that nothing ever said so: the till showed a bigger number with
-- nothing beside it, and the slip printed the total as though it were an
-- ordinary Tuesday. A customer has no way to tell a working promotion from a
-- broken one, and neither does the merchant running it.
--
-- Stored on the receipt rather than derived at read time, because rules change:
-- a receipt is a record of what happened, and re-evaluating today's rules
-- against last month's sale would quietly rewrite it.

ALTER TABLE receipt ADD COLUMN IF NOT EXISTS bonuses JSONB NOT NULL DEFAULT '[]'::jsonb;
