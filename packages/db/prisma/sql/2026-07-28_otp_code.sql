-- Sign-in codes lived in a per-instance Map, so a code issued before a deploy
-- could not be verified after one, and a second instance would reject every
-- code the first had issued. Persisting them makes sign-in survive both.
-- Only the hash is stored; the code exists only in the message sent.

CREATE TABLE IF NOT EXISTS otp_code (
    phone_hash   TEXT PRIMARY KEY,
    code_hash    TEXT NOT NULL,
    expires_at   TIMESTAMP(3) NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    send_count   INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS otp_code_expires_at_idx ON otp_code (expires_at);

-- Sign-in happens before any tenant context exists, so this table is reached
-- through definer functions rather than RLS.
ALTER TABLE otp_code ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.otp_issue(
  p_phone_hash text, p_code_hash text, p_ttl_seconds int,
  p_max_sends int, p_window_seconds int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing otp_code%ROWTYPE;
  now_ts timestamp(3) := now();
BEGIN
  SELECT * INTO existing FROM otp_code WHERE phone_hash = p_phone_hash;

  IF FOUND AND existing.window_start > now_ts - make_interval(secs => p_window_seconds) THEN
    IF existing.send_count >= p_max_sends THEN
      -- Refuse rather than keep texting a number someone else is guessing at.
      RETURN jsonb_build_object(
        'sent', false,
        'retryAfterSeconds',
        GREATEST(1, p_window_seconds - EXTRACT(EPOCH FROM (now_ts - existing.window_start))::int));
    END IF;
    UPDATE otp_code SET
      code_hash = p_code_hash,
      expires_at = now_ts + make_interval(secs => p_ttl_seconds),
      attempts = 0,
      send_count = existing.send_count + 1
     WHERE phone_hash = p_phone_hash;
  ELSE
    INSERT INTO otp_code (phone_hash, code_hash, expires_at, attempts, send_count, window_start)
    VALUES (p_phone_hash, p_code_hash, now_ts + make_interval(secs => p_ttl_seconds), 0, 1, now_ts)
    ON CONFLICT (phone_hash) DO UPDATE SET
      code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at,
      attempts = 0,
      send_count = 1,
      window_start = now_ts;
  END IF;

  RETURN jsonb_build_object('sent', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.otp_verify(
  p_phone_hash text, p_code_hash text, p_max_attempts int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec otp_code%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM otp_code WHERE phone_hash = p_phone_hash FOR UPDATE;
  IF NOT FOUND OR rec.expires_at < now() OR rec.attempts >= p_max_attempts THEN
    RETURN false;
  END IF;

  UPDATE otp_code SET attempts = rec.attempts + 1 WHERE phone_hash = p_phone_hash;

  IF rec.code_hash = p_code_hash THEN
    -- Consume it: a code is good exactly once.
    DELETE FROM otp_code WHERE phone_hash = p_phone_hash;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

/** Housekeeping for expired rows. */
CREATE OR REPLACE FUNCTION public.otp_prune() RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (DELETE FROM otp_code WHERE expires_at < now() - interval '1 day' RETURNING 1)
  SELECT count(*)::int FROM gone
$$;

REVOKE ALL ON FUNCTION public.otp_issue(text, text, int, int, int) FROM public;
REVOKE ALL ON FUNCTION public.otp_verify(text, text, int) FROM public;
REVOKE ALL ON FUNCTION public.otp_prune() FROM public;

GRANT EXECUTE ON FUNCTION public.otp_issue(text, text, int, int, int) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.otp_verify(text, text, int) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.otp_prune() TO loyalty_app;
