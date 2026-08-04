-- Finishing a stamp card, on the receipt.
--
-- A completed card is the best moment this system produces for a customer, and
-- the receipt said nothing about it. Worse, the till printed the *next* card —
-- "0 OF 10 · 10 TO GO" — on the very visit that filled the last one, so the
-- reward looked like a reset.
--
-- Stored on the receipt rather than looked up when it is read, for the same
-- reason as `bonuses`: a receipt is a record of what happened. Challenges get
-- edited and stamp cards roll over, and re-deriving this later would rewrite
-- history.

ALTER TABLE receipt ADD COLUMN IF NOT EXISTS celebrations JSONB NOT NULL DEFAULT '[]'::jsonb;
