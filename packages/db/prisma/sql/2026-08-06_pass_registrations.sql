-- Keeping a pass in someone's wallet up to date.
--
-- A pass does not poll. Apple's model is: the device registers itself against a
-- pass, we send a content-free push when that pass changes, and the device then
-- comes back and asks what changed. Three tables' worth of bookkeeping for one
-- number on a lock screen — but without it a stamp card shows the count it had
-- when it was added, which is worse than showing nothing.
--
-- Serial numbers here are membership ids: that is what the pass carries, and
-- what the device sends back.

CREATE TABLE IF NOT EXISTS pass_registration (
  device_library_id TEXT NOT NULL,
  serial_number     TEXT NOT NULL,
  push_token        TEXT NOT NULL,
  pass_type_id      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_library_id, serial_number)
);

-- The two directions Apple asks in: "what changed for this device" and, when a
-- balance moves, "who do I notify about this pass".
CREATE INDEX IF NOT EXISTS pass_registration_device_idx
    ON pass_registration (device_library_id, pass_type_id);
CREATE INDEX IF NOT EXISTS pass_registration_serial_idx
    ON pass_registration (serial_number);

-- When each pass last changed.
--
-- Apple sends back the tag we gave it last time and expects only serials newer
-- than that. A timestamp per pass answers that directly; deriving it from the
-- ledger would mean a scan per device poll.
CREATE TABLE IF NOT EXISTS pass_state (
  serial_number TEXT PRIMARY KEY,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── register a device ──────────────────────────────────────────────────────
-- Re-registration is normal: iOS re-registers on restore and after an app
-- update, and the push token rotates. Upsert, never accumulate.
CREATE OR REPLACE FUNCTION public.pass_register_device(
  p_device_library_id text,
  p_serial_number text,
  p_push_token text,
  p_pass_type_id text
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO pass_registration (device_library_id, serial_number, push_token, pass_type_id)
       VALUES (p_device_library_id, p_serial_number, p_push_token, p_pass_type_id)
  ON CONFLICT (device_library_id, serial_number) DO UPDATE
          SET push_token = EXCLUDED.push_token,
              pass_type_id = EXCLUDED.pass_type_id
  RETURNING true
$$;

CREATE OR REPLACE FUNCTION public.pass_unregister_device(
  p_device_library_id text,
  p_serial_number text
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM pass_registration
   WHERE device_library_id = p_device_library_id
     AND serial_number = p_serial_number
  RETURNING true
$$;

-- ── what changed for this device ───────────────────────────────────────────
-- A null tag means the device has never asked, so everything it holds is new
-- to it.
CREATE OR REPLACE FUNCTION public.pass_serials_for_device(
  p_device_library_id text,
  p_pass_type_id text,
  p_since timestamptz
) RETURNS TABLE (serial_number text, updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.serial_number, COALESCE(s.updated_at, r.created_at)
    FROM pass_registration r
    LEFT JOIN pass_state s ON s.serial_number = r.serial_number
   WHERE r.device_library_id = p_device_library_id
     AND r.pass_type_id = p_pass_type_id
     AND (p_since IS NULL OR COALESCE(s.updated_at, r.created_at) > p_since)
$$;

-- ── who to notify when a pass changes ──────────────────────────────────────
-- Also stamps the change, so the device's next poll sees this serial as new.
CREATE OR REPLACE FUNCTION public.pass_touch_and_devices(p_serial_number text)
RETURNS TABLE (push_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO pass_state (serial_number, updated_at)
       VALUES (p_serial_number, now())
  ON CONFLICT (serial_number) DO UPDATE SET updated_at = now();

  RETURN QUERY
    SELECT DISTINCT r.push_token FROM pass_registration r
     WHERE r.serial_number = p_serial_number;
END $$;

-- A push token Apple has told us is dead. Left behind, they accumulate for the
-- life of the account and every update wastes a request on them.
CREATE OR REPLACE FUNCTION public.pass_drop_push_token(p_push_token text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM pass_registration WHERE push_token = p_push_token RETURNING true
$$;

REVOKE ALL ON FUNCTION public.pass_register_device(text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.pass_unregister_device(text, text) FROM public;
REVOKE ALL ON FUNCTION public.pass_serials_for_device(text, text, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.pass_touch_and_devices(text) FROM public;
REVOKE ALL ON FUNCTION public.pass_drop_push_token(text) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.pass_register_device(text, text, text, text) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.pass_unregister_device(text, text) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.pass_serials_for_device(text, text, timestamptz) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.pass_touch_and_devices(text) TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.pass_drop_push_token(text) TO loyalty_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON pass_registration TO loyalty_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON pass_state TO loyalty_app;
  END IF;
END $$;
