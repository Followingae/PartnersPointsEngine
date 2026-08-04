-- Devices we can reach with a notification.
--
-- Registered the moment a customer grants permission, long before anything
-- sends. Doing it the other way round — building the sender first and
-- collecting tokens later — means asking everybody for permission a second
-- time, which is the one thing a notification prompt cannot survive.
--
-- Keyed by the token itself: the same device re-registering must update its
-- row, not accumulate rows, or a customer ends up with six copies of every
-- message.

CREATE TABLE IF NOT EXISTS push_token (
  token       TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_token_person_idx ON push_token (person_id);

CREATE OR REPLACE FUNCTION public.wallet_register_push_token(
  p_person_id text,
  p_token text,
  p_platform text
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO push_token (token, person_id, platform)
       VALUES (p_token, p_person_id, p_platform)
  ON CONFLICT (token) DO UPDATE
          SET person_id = EXCLUDED.person_id,
              platform = EXCLUDED.platform,
              last_seen_at = now()
  RETURNING true
$$;

REVOKE ALL ON FUNCTION public.wallet_register_push_token(text, text, text) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.wallet_register_push_token(text, text, text) TO loyalty_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON push_token TO loyalty_app;
  END IF;
END $$;
