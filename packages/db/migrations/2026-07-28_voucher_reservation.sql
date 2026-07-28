-- Tapping "USE" on a reward at the till marked the voucher redeemed immediately.
-- Abandon the sale — back out, decline, close the app — and the customer's reward
-- was gone with nothing given in return, unrecoverably. Points redemption has had
-- an authorize -> capture/void lifecycle from the start; vouchers skipped it.
--
-- 'reserved' is that missing hold: taken when the cashier applies the reward,
-- confirmed when the sale captures, released automatically if the sale never does.

ALTER TYPE voucher_status ADD VALUE IF NOT EXISTS 'reserved';

ALTER TABLE voucher ADD COLUMN IF NOT EXISTS reserved_at timestamptz;

CREATE INDEX IF NOT EXISTS voucher_reserved_at_idx
    ON voucher (reserved_at)
 WHERE reserved_at IS NOT NULL;
