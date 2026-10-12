-- Fraud case review-requests + superadmin-owned governance.
--
-- Brands no longer resolve/dismiss a fraud case directly (that authority moves to
-- the superadmin). Instead a brand can *request a review* on a case — a time-bound
-- ask the superadmin then approves (resolve/dismiss) or rejects. These columns
-- carry that request, and the status CHECK is widened to allow 'review_requested'.
--
-- Idempotent: guarded ADD COLUMN IF NOT EXISTS + a re-runnable CHECK swap.

ALTER TABLE public.fraud_alert ADD COLUMN IF NOT EXISTS request_reason     TEXT;
ALTER TABLE public.fraud_alert ADD COLUMN IF NOT EXISTS requested_by       TEXT;
ALTER TABLE public.fraud_alert ADD COLUMN IF NOT EXISTS requested_at       TIMESTAMP(3);
ALTER TABLE public.fraud_alert ADD COLUMN IF NOT EXISTS request_expires_at TIMESTAMP(3);
ALTER TABLE public.fraud_alert ADD COLUMN IF NOT EXISTS resolution_note    TEXT;

-- Widen the status domain to include 'review_requested'. The column was created
-- with an inline CHECK (named fraud_alert_status_check by Postgres); drop whatever
-- status CHECK exists and recreate it with the new value, re-runnably.
DO $$
DECLARE
  con text;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.fraud_alert'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.fraud_alert DROP CONSTRAINT %I', con);
  END LOOP;
  ALTER TABLE public.fraud_alert
    ADD CONSTRAINT fraud_alert_status_check
    CHECK (status IN ('open','acknowledged','review_requested','resolved','dismissed'));
END $$;

-- Help the superadmin queue: find cases awaiting a decision fast.
CREATE INDEX IF NOT EXISTS ix_fraud_alert_platform_requested
  ON public.fraud_alert (platform_id, status, requested_at DESC);
