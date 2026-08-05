-- Account deletion, scheduled rather than immediate.
--
-- Apple 5.1.1(v) and Google Play both require a customer to start *and finish*
-- deletion from inside the app. A request that waits on staff to act, or on the
-- customer to answer a call, fails review — so this completes on its own.
--
-- The thirty-day wait is not a stalling tactic: points are a liability on the
-- merchant's books, and someone deleting an account with a full stamp card
-- should get a phone call before it evaporates. The window is when that call
-- happens. If nobody makes it, the deletion still lands.
--
-- What "deleted" means here is anonymised, not erased. Ledger rows are the
-- merchant's accounting record — deleting them would silently restate revenue
-- and liability figures already reported. So the person is stripped of every
-- identifying attribute and the ledger keeps referring to a membership with
-- nobody behind it.

CREATE TABLE IF NOT EXISTS account_deletion (
  person_id     TEXT PRIMARY KEY REFERENCES person(id) ON DELETE CASCADE,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ NOT NULL,
  cancelled_at  TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  -- Free text from the customer, if they gave a reason. Useful to the team
  -- making the call, and the only field here they ever wrote.
  reason        TEXT
);

-- The sweep looks for due, live requests; this is the index it runs on.
CREATE INDEX IF NOT EXISTS account_deletion_due_idx
    ON account_deletion (scheduled_for)
 WHERE cancelled_at IS NULL AND completed_at IS NULL;

-- ── request ────────────────────────────────────────────────────────────────
-- Re-requesting is not an error: it returns the existing schedule rather than
-- pushing the date back, so tapping twice cannot extend the wait indefinitely.
CREATE OR REPLACE FUNCTION public.wallet_request_deletion(
  p_person_id text,
  p_days int,
  p_reason text
) RETURNS TABLE (requested_at timestamptz, scheduled_for timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO account_deletion (person_id, scheduled_for, reason)
       VALUES (p_person_id, now() + make_interval(days => p_days), p_reason)
  ON CONFLICT (person_id) DO UPDATE
          SET cancelled_at = NULL,
              completed_at = NULL,
              reason = COALESCE(EXCLUDED.reason, account_deletion.reason),
              -- Only a previously cancelled request gets a fresh date. A live
              -- one keeps the date the customer was already told.
              requested_at = CASE WHEN account_deletion.cancelled_at IS NOT NULL
                                  THEN now() ELSE account_deletion.requested_at END,
              scheduled_for = CASE WHEN account_deletion.cancelled_at IS NOT NULL
                                   THEN now() + make_interval(days => p_days)
                                   ELSE account_deletion.scheduled_for END
    RETURNING account_deletion.requested_at, account_deletion.scheduled_for
$$;

-- ── cancel ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_cancel_deletion(p_person_id text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE account_deletion
     SET cancelled_at = now()
   WHERE person_id = p_person_id
     AND cancelled_at IS NULL
     AND completed_at IS NULL
  RETURNING true
$$;

-- ── status ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_deletion_status(p_person_id text)
RETURNS TABLE (requested_at timestamptz, scheduled_for timestamptz, cancelled_at timestamptz, completed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT requested_at, scheduled_for, cancelled_at, completed_at
    FROM account_deletion WHERE person_id = p_person_id
$$;

-- ── the sweep ──────────────────────────────────────────────────────────────
-- Claims due requests and anonymises them in one transaction.
--
-- Identity is destroyed here: name, phone, email, birthdate and nationality all
-- go, and the encrypted columns are nulled rather than overwritten so no
-- ciphertext survives to be attacked later. Unspent points are voided by
-- suspending the memberships — the ledger rows themselves are left exactly as
-- they were, because they are the merchant's books, not the customer's data.
--
-- FOR UPDATE SKIP LOCKED so two API instances sweeping together take different
-- rows instead of fighting over the same one.
CREATE OR REPLACE FUNCTION public.sweep_account_deletions(p_limit int)
RETURNS TABLE (person_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT d.person_id
      FROM account_deletion d
     WHERE d.cancelled_at IS NULL
       AND d.completed_at IS NULL
       AND d.scheduled_for <= now()
     ORDER BY d.scheduled_for
     LIMIT p_limit
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE person
       SET full_name = NULL,
           phone_enc = NULL,
           email_enc = NULL,
           birthdate = NULL,
           nationality = NULL,
           status = 'archived'
     WHERE id = r.person_id;

    -- Nothing can reach the account afterwards: no session to refresh, no
    -- device to notify, and no phone number left to send an OTP to.
    DELETE FROM push_token WHERE push_token.person_id = r.person_id;

    UPDATE customer_membership
       SET status = 'archived'
     WHERE customer_membership.person_id = r.person_id;

    UPDATE account_deletion SET completed_at = now() WHERE account_deletion.person_id = r.person_id;

    person_id := r.person_id;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.wallet_request_deletion(text, int, text) FROM public;
REVOKE ALL ON FUNCTION public.wallet_cancel_deletion(text) FROM public;
REVOKE ALL ON FUNCTION public.wallet_deletion_status(text) FROM public;
REVOKE ALL ON FUNCTION public.sweep_account_deletions(int) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.wallet_request_deletion(text, int, text) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.wallet_cancel_deletion(text) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.wallet_deletion_status(text) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.sweep_account_deletions(int) TO loyalty_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON account_deletion TO loyalty_app;
  END IF;
END $$;
