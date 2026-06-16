-- ─────────────────────────────────────────────────────────────────────────────
-- RFM Loyalty Engine — Ledger integrity (Phase 2)
-- Apply AFTER baseline + rls. Adds the constraints/triggers that make the
-- double-entry ledger financial-grade and that Prisma cannot express:
--   * append-only journal + entry (no UPDATE/DELETE)
--   * every journal must balance (Σ debits = Σ credits), checked at commit
--   * entry amounts are strictly positive
--   * credit-normal accounts can never be overdrawn (no negative balance)
--   * one ledger account per (ledger, type, asset, group, brand?, customer?)
-- ─────────────────────────────────────────────────────────────────────────────

-- Reuse / define the append-only guard (idempotent).
CREATE OR REPLACE FUNCTION public.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %.% cannot be UPDATEd or DELETEd',
    TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS no_mutation ON public.journal;
CREATE TRIGGER no_mutation
  BEFORE UPDATE OR DELETE ON public.journal
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();

DROP TRIGGER IF EXISTS no_mutation ON public.entry;
CREATE TRIGGER no_mutation
  BEFORE UPDATE OR DELETE ON public.entry
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();

-- Balanced-journal invariant: Σ(debit) − Σ(credit) = 0 per journal, at commit.
CREATE OR REPLACE FUNCTION public.assert_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  imbalance bigint;
  asset_count int;
BEGIN
  SELECT
    coalesce(sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END), 0),
    count(DISTINCT asset_code)
  INTO imbalance, asset_count
  FROM public.entry
  WHERE journal_id = NEW.journal_id;

  IF asset_count > 1 THEN
    RAISE EXCEPTION 'journal % mixes assets', NEW.journal_id USING ERRCODE = 'check_violation';
  END IF;
  IF imbalance <> 0 THEN
    RAISE EXCEPTION 'journal % is unbalanced (imbalance=%)', NEW.journal_id, imbalance
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS journal_balanced ON public.entry;
CREATE CONSTRAINT TRIGGER journal_balanced
  AFTER INSERT ON public.entry
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_balanced();

-- Entry amounts strictly positive (direction carries the sign).
ALTER TABLE public.entry
  ADD CONSTRAINT entry_amount_positive CHECK (amount_minor > 0);

-- No negative balance for credit-normal accounts (points liability, wallet liability).
-- available = posted_credits − posted_debits − pending_debits must stay >= 0.
ALTER TABLE public.account_balance
  ADD CONSTRAINT account_balance_non_negative CHECK (
    normal_side <> 'credit'
    OR (posted_credits - posted_debits - pending_debits) >= 0
  );

-- Exactly one account per logical identity (NULL-safe via coalesce on text ids).
CREATE UNIQUE INDEX uq_ledger_account_identity ON public.ledger_account (
  ledger, account_type, asset_code, group_id,
  coalesce(brand_id, ''), coalesce(customer_id, '')
);
