-- Nationality, and an opt-out for per-transaction messages.
--
-- Nationality is ISO 3166-1 alpha-2 rather than a free string. `gender` set the
-- opposite precedent — a free-form column whose valid values live in three
-- independently hardcoded UI lists — and repeating that for ~200 countries would
-- be considerably worse. Stored plaintext and queryable, like the other
-- demographics, because the whole point is to segment on it.
--
-- The opt-out exists because "a WhatsApp after every transaction" is close enough
-- to marketing that consent matters, whatever the strict classification.

ALTER TABLE person ADD COLUMN IF NOT EXISTS nationality VARCHAR(2);
ALTER TABLE person ADD COLUMN IF NOT EXISTS txn_alerts_opt_out BOOLEAN NOT NULL DEFAULT false;

-- Segments will filter on nationality; without this every such query is a scan.
CREATE INDEX IF NOT EXISTS person_nationality_idx ON person (nationality) WHERE nationality IS NOT NULL;

-- ── wallet_profile: return the new fields ───────────────────────────────────
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
           'emailEnc',     encode(p.email_enc, 'base64')
         )
    FROM person p WHERE p.id = p_person_id
$$;

-- ── wallet_update_profile: new arity, and null now clears ───────────────────
-- The old 4-arg version used COALESCE on every column, so passing null never
-- cleared a field — while the DTO documented `birthdate: null` as "null clears
-- it" and the app relied on exactly that. Clearing your birthday silently did
-- nothing. Callers now pass an explicit per-field flag, so "leave alone" and
-- "set to null" are finally distinguishable.
DROP FUNCTION IF EXISTS public.wallet_update_profile(text, text, text, date);

CREATE OR REPLACE FUNCTION public.wallet_update_profile(
  p_person_id text,
  p_set_full_name boolean, p_full_name text,
  p_set_gender boolean, p_gender text,
  p_set_birthdate boolean, p_birthdate date,
  p_set_nationality boolean, p_nationality text,
  p_set_opt_out boolean, p_opt_out boolean
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE person SET
    full_name   = CASE WHEN p_set_full_name   THEN p_full_name   ELSE full_name END,
    gender      = CASE WHEN p_set_gender      THEN p_gender      ELSE gender END,
    birthdate   = CASE WHEN p_set_birthdate   THEN p_birthdate   ELSE birthdate END,
    nationality = CASE WHEN p_set_nationality THEN upper(p_nationality) ELSE nationality END,
    txn_alerts_opt_out = CASE WHEN p_set_opt_out THEN p_opt_out ELSE txn_alerts_opt_out END,
    updated_at  = now()
  WHERE id = p_person_id
  RETURNING jsonb_build_object('id', id, 'fullName', full_name);
$$;

-- ── who to message after a transaction ──────────────────────────────────────
-- The relay worker has no tenant context (it runs per outbox row, across
-- brands), so this follows the established definer pattern. Returns nothing when
-- the customer has opted out, so the opt-out is enforced at the source rather
-- than trusted to every caller.
CREATE OR REPLACE FUNCTION public.txn_alert_recipient(p_membership_id text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'personId',  p.id,
           'firstName', COALESCE(split_part(NULLIF(trim(p.full_name), ''), ' ', 1), 'there'),
           'phoneEnc',  encode(p.phone_enc, 'base64'),
           'brandName', b.name,
           'pointsCode', b.points_currency_code,
           'currency',  b.currency,
           -- Whether this is their first earn here decides welcome vs routine.
           'priorEarns', (
             SELECT count(*) FROM terminal_transaction tt
              WHERE tt.membership_id = cm.id AND tt.intent = 'earn' AND tt.state = 'captured')
         )
    FROM customer_membership cm
    JOIN person p ON p.id = cm.person_id
    JOIN brand b  ON b.id = cm.brand_id
   WHERE cm.id = p_membership_id
     AND p.txn_alerts_opt_out = false
     AND p.phone_enc IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.wallet_update_profile(text, boolean, text, boolean, text, boolean, date, boolean, text, boolean, boolean) FROM public;
REVOKE ALL ON FUNCTION public.txn_alert_recipient(text) FROM public;

GRANT EXECUTE ON FUNCTION public.wallet_profile(text) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.wallet_update_profile(text, boolean, text, boolean, text, boolean, date, boolean, text, boolean, boolean) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.txn_alert_recipient(text) TO loyalty_app;
