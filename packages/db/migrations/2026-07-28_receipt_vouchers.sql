-- Receipts recorded the points side of a sale but said nothing about rewards, so
-- neither the printed slip nor the eReceipt showed which voucher was handed over
-- or its number — leaving a customer and a merchant with no shared record of it.

ALTER TABLE receipt ADD COLUMN IF NOT EXISTS vouchers jsonb NOT NULL DEFAULT '[]'::jsonb;
