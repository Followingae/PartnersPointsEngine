-- Devices signed in to a wallet, so Security can list real ones.
--
-- The screen had been showing two invented devices. Everything needed to show
-- the real ones was already in `refresh_token` — one active row per device,
-- because rotation revokes the old token as it issues the new — except for two
-- things: nothing ever wrote `user_agent`, and `created_at` is reset by every
-- rotation, so "signed in 3 weeks ago" would have read as "a minute ago".
--
-- `first_seen_at` is carried forward across rotations and `created_at` is left
-- to mean last-renewed, which is as close to "last used" as a rotating session
-- gets. Existing rows backfill from `created_at`: it is the only honest answer
-- for a session that started before this column existed.

ALTER TABLE refresh_token
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE refresh_token SET first_seen_at = created_at WHERE first_seen_at > created_at;

-- ── wallet_sessions ─────────────────────────────────────────────────────────
-- Active sessions for one person. A revoked or expired row is not a device
-- anyone can sign out, so it is not offered.
CREATE OR REPLACE FUNCTION public.wallet_sessions(p_person_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          t.id,
        'userAgent',   t.user_agent,
        'firstSeenAt', t.first_seen_at,
        'lastSeenAt',  t.created_at,
        'expiresAt',   t.expires_at
      )
      ORDER BY t.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM refresh_token t
  WHERE t.person_id = p_person_id
    AND t.revoked_at IS NULL
    AND t.expires_at > now()
$$;

-- ── wallet_revoke_session ───────────────────────────────────────────────────
-- Signing another device out. Scoped to the person in the same statement that
-- finds the row, so an id belonging to somebody else revokes nothing rather
-- than erroring in a way that confirms the id exists.
CREATE OR REPLACE FUNCTION public.wallet_revoke_session(
  p_person_id text,
  p_session_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hit integer;
BEGIN
  UPDATE refresh_token
     SET revoked_at = now()
   WHERE id = p_session_id
     AND person_id = p_person_id
     AND revoked_at IS NULL;
  GET DIAGNOSTICS hit = ROW_COUNT;
  RETURN hit > 0;
END $$;

REVOKE ALL ON FUNCTION public.wallet_sessions(text) FROM public;
REVOKE ALL ON FUNCTION public.wallet_revoke_session(text, text) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.wallet_sessions(text) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.wallet_revoke_session(text, text) TO loyalty_app;
  END IF;
END $$;
