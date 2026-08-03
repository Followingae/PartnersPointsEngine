-- Some person rows hold the phone (and possibly email) in the clear rather than
-- envelope-encrypted — seeded rows and at least one real customer. Two things
-- went wrong: PII that should be encrypted at rest wasn't, and every read of it
-- failed silently, because the decrypt error was swallowed and the caller just
-- saw "no phone". That is what stopped transaction alerts from being sent.
--
-- These functions let the app find and repair those rows. Definer-scoped like
-- everything else on a cross-tenant path: `person` is under RLS and a backfill
-- has no single tenant to run as.

CREATE OR REPLACE FUNCTION public.pii_encryption_candidates()
RETURNS TABLE (id text, phone_enc bytea, email_enc bytea)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.phone_enc, p.email_enc
    FROM person p
   WHERE p.phone_enc IS NOT NULL OR p.email_enc IS NOT NULL
$$;

-- The first version returned void, which Prisma's $queryRaw cannot deserialise:
-- the very first write threw and aborted the whole sweep after one row. A
-- boolean also lets the caller distinguish "updated" from "no such row".
-- CREATE OR REPLACE cannot change a return type, so the old one is dropped.
DROP FUNCTION IF EXISTS public.pii_set_encrypted(text, bytea, bytea);

CREATE FUNCTION public.pii_set_encrypted(
  p_person_id text, p_phone_enc bytea, p_email_enc bytea
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n int;
BEGIN
  UPDATE person SET
    phone_enc = COALESCE(p_phone_enc, phone_enc),
    email_enc = COALESCE(p_email_enc, email_enc)
  WHERE id = p_person_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.pii_encryption_candidates() FROM public;
REVOKE ALL ON FUNCTION public.pii_set_encrypted(text, bytea, bytea) FROM public;

GRANT EXECUTE ON FUNCTION public.pii_encryption_candidates() TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.pii_set_encrypted(text, bytea, bytea) TO loyalty_app;
