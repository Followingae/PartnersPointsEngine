-- A customer's home area, and the profile fields the app now asks for.
--
-- "Home area" is the sixth item on the profile checklist. It exists so offers
-- from the other side of the country stop showing up — a customer who always
-- goes to the JLT branch does not want a Sharjah promotion. The suggestion
-- comes from where they actually go, which the terminal already records on
-- every transaction; this column is the answer once they confirm it.
--
-- Deliberately on `person`, not on a membership: someone's home area is where
-- they live, not a per-brand fact, and asking six times because they hold six
-- cards would be absurd.

ALTER TABLE person ADD COLUMN IF NOT EXISTS home_branch_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_home_branch_id_fkey') THEN
    ALTER TABLE person
      ADD CONSTRAINT person_home_branch_id_fkey
      FOREIGN KEY (home_branch_id) REFERENCES branch(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── wallet_profile: the six checklist fields ────────────────────────────────
-- Adds the home branch and its name. Email was already stored encrypted and
-- returned; what was missing is somewhere for the app to see it as one of the
-- things still to fill in.
CREATE OR REPLACE FUNCTION public.wallet_profile(p_person_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'id',           p.id,
           'fullName',     p.full_name,
           'gender',       p.gender,
           'birthdate',    p.birthdate,
           'nationality',  p.nationality,
           'txnAlertsOptOut', p.txn_alerts_opt_out,
           'status',       p.status::text,
           'joinedAt',     p.created_at,
           'phoneEnc',     encode(p.phone_enc, 'base64'),
           'emailEnc',     encode(p.email_enc, 'base64'),
           'homeBranchId', p.home_branch_id,
           'homeBranchName', (SELECT b.name FROM branch b WHERE b.id = p.home_branch_id)
         )
    FROM person p WHERE p.id = p_person_id
$$;

-- ── wallet_set_home_branch ─────────────────────────────────────────────────
-- Scoped to branches the person could plausibly have visited: a brand they
-- hold a card for. Without that check, any branch id in the platform would be
-- settable by anyone.
CREATE OR REPLACE FUNCTION public.wallet_set_home_branch(
  p_person_id text,
  p_branch_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ok boolean;
BEGIN
  IF p_branch_id IS NULL THEN
    UPDATE person SET home_branch_id = NULL, updated_at = now() WHERE id = p_person_id;
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM branch b
      JOIN customer_membership m ON m.brand_id = b.brand_id
     WHERE b.id = p_branch_id AND m.person_id = p_person_id
  ) INTO ok;

  IF NOT ok THEN RETURN false; END IF;

  UPDATE person SET home_branch_id = p_branch_id, updated_at = now() WHERE id = p_person_id;
  RETURN true;
END $$;

-- ── wallet_branch_visits ───────────────────────────────────────────────────
-- Where this person actually goes, most-visited first. The app offers the top
-- one as a suggestion; it never sets it without being told to.
CREATE OR REPLACE FUNCTION public.wallet_branch_visits(p_person_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    jsonb_agg(x ORDER BY (x->>'visits')::int DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
             'branchId', b.id,
             'branchName', b.name,
             'brandId', b.brand_id,
             'brandName', br.name,
             'visits', count(*)::int
           ) AS x
      FROM terminal_transaction t
      JOIN customer_membership m ON m.id = t.membership_id
      JOIN branch b ON b.id = t.branch_id
      JOIN brand br ON br.id = b.brand_id
     WHERE m.person_id = p_person_id
       AND t.branch_id IS NOT NULL
       AND t.state IN ('captured', 'authorized')
     GROUP BY b.id, b.name, b.brand_id, br.name
  ) s
$$;

REVOKE ALL ON FUNCTION public.wallet_set_home_branch(text, text) FROM public;
REVOKE ALL ON FUNCTION public.wallet_branch_visits(text) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.wallet_set_home_branch(text, text) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.wallet_branch_visits(text) TO loyalty_app;
  END IF;
END $$;
