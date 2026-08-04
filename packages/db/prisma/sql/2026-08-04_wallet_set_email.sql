-- Let a customer add their own email.
--
-- It is one of the six items the profile checklist asks for and one of the two
-- the app prompts about, but there was no way to write it: the wallet's update
-- function covers name, gender, birthday and nationality only, so "Email — for
-- vouchers and receipts" was a row the customer could see and never fill in.
--
-- Hash and ciphertext are computed in the API, not here: the encryption key
-- lives in the application and must not be reachable from SQL. This function
-- only stores what it is handed.
--
-- The hash is unique across the platform, so a second person claiming an
-- address already in use is refused rather than silently taking it over.

CREATE OR REPLACE FUNCTION public.wallet_set_email(
  p_person_id text,
  p_email_hash text,
  p_email_enc bytea
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  taken boolean;
BEGIN
  IF p_email_hash IS NULL THEN
    UPDATE person SET email_hash = NULL, email_enc = NULL, updated_at = now()
     WHERE id = p_person_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM person WHERE email_hash = p_email_hash AND id <> p_person_id
  ) INTO taken;

  IF taken THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'that email is already in use');
  END IF;

  UPDATE person
     SET email_hash = p_email_hash, email_enc = p_email_enc, updated_at = now()
   WHERE id = p_person_id;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.wallet_set_email(text, text, bytea) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.wallet_set_email(text, text, bytea) TO loyalty_app;
  END IF;
END $$;
