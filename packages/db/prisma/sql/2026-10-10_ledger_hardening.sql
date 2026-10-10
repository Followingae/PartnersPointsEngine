-- Ledger integrity backstops + hot-path indexes.
--
-- 1) pending_debits can never go negative. The capture∥void race left it at
--    -100 and the existing CHECK (available >= 0) PASSED because a negative
--    pending makes available larger. A dedicated non-negative CHECK on
--    pending_debits itself closes that. Added NOT VALID so it enforces every
--    new write immediately without a blocking full-table scan on deploy; run
--    `ALTER TABLE account_balance VALIDATE CONSTRAINT account_balance_pending_non_negative;`
--    once any pre-existing negative rows are corrected.
-- 2) Indexes the audit found missing on money hot paths.
-- Idempotent: DROP ... IF EXISTS before ADD; CREATE INDEX IF NOT EXISTS.

ALTER TABLE public.account_balance
  DROP CONSTRAINT IF EXISTS account_balance_pending_non_negative;
ALTER TABLE public.account_balance
  ADD CONSTRAINT account_balance_pending_non_negative CHECK (pending_debits >= 0) NOT VALID;

-- Balance/earn lookups and analytics join ledger_account by customer_id, which
-- was only present as the 6th, coalesce()-wrapped column of the identity unique
-- index and therefore unusable. Partial index on the rows that have one.
CREATE INDEX IF NOT EXISTS ix_ledger_account_customer
  ON public.ledger_account (customer_id)
  WHERE customer_id IS NOT NULL;

-- Settlement scans terminal_transaction by (group, intent, state, unsettled)
-- every 60s per group; there was no group_id index at all.
CREATE INDEX IF NOT EXISTS ix_terminal_txn_settlement
  ON public.terminal_transaction (group_id, intent, state)
  WHERE settled_at IS NULL;

-- Expiry sweep aggregates entries by account and expiry bucket.
CREATE INDEX IF NOT EXISTS ix_entry_account_expiry
  ON public.entry (account_id, expiry_bucket)
  WHERE expiry_bucket IS NOT NULL;

-- Retention/purge and session listing scan refresh_token by expiry.
CREATE INDEX IF NOT EXISTS ix_refresh_token_expires
  ON public.refresh_token (expires_at);

-- One voucher per redemption journal: DB backstop for the in-app redeem replay
-- fix, so even two concurrent replays of the same capture cannot mint two
-- vouchers. Partial, since system/manual vouchers carry no redeem journal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_redeem_journal
  ON public.voucher (redeem_journal_id)
  WHERE redeem_journal_id IS NOT NULL;
