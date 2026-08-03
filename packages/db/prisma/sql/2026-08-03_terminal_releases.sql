-- Over-the-air updates for the terminal fleet.
--
-- Terminals are in shops, not on desks. Until now every change to the till app
-- meant physically carrying a laptop to each one, which is why the fleet has
-- been running whatever build happened to be installed the last time somebody
-- visited. This is the mechanism that ends that: the device asks what the
-- current build is, and installs it.
--
-- The APK is not stored in Postgres. It lives wherever it is published and this
-- row points at it, carrying the digest the device verifies before installing —
-- a terminal that fetched a swapped binary and installed it would be about the
-- worst outcome this system has.
--
-- Platform-wide, not per-brand. It is one fleet and one binary; a brand-scoped
-- release would mean one shop's tills silently diverging from its neighbour's.

CREATE TABLE IF NOT EXISTS terminal_release (
  id           TEXT PRIMARY KEY,
  platform_id  TEXT NOT NULL REFERENCES platform(id) ON DELETE CASCADE,
  version_code INTEGER NOT NULL,
  version_name TEXT NOT NULL,
  url          TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  notes        TEXT,
  mandatory    BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One row per build. Re-publishing a version code would leave two terminals
  -- disagreeing about what "17" means.
  CONSTRAINT terminal_release_version_uniq UNIQUE (platform_id, version_code),
  -- A digest that isn't a SHA-256 can't be checked, so it must not be storable.
  CONSTRAINT terminal_release_sha256_chk CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- Only https: an APK fetched over cleartext is an APK anyone on the shop's
  -- wifi can replace.
  CONSTRAINT terminal_release_url_chk CHECK (url LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS terminal_release_current_idx
  ON terminal_release (platform_id, published_at DESC NULLS LAST);

-- What each terminal last told us it was running. Without this, "is the fleet
-- updated?" has no answer short of walking into every shop.
ALTER TABLE terminal ADD COLUMN IF NOT EXISTS app_version_code INTEGER;
ALTER TABLE terminal ADD COLUMN IF NOT EXISTS app_version_name TEXT;
ALTER TABLE terminal ADD COLUMN IF NOT EXISTS app_seen_at TIMESTAMPTZ;

-- RLS: releases are platform-scoped and superadmin-owned. Terminals read the
-- current one through a definer function rather than a policy, because a
-- terminal's tenant context is its brand and a release has no brand.
ALTER TABLE terminal_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_release FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terminal_release_platform ON terminal_release;
CREATE POLICY terminal_release_platform ON terminal_release
  USING (platform_id = current_setting('app.current_platform', true))
  WITH CHECK (platform_id = current_setting('app.current_platform', true));

-- ── terminal_current_release ────────────────────────────────────────────────
-- The build a terminal should be running: the highest published version code
-- for its platform. Drafts are invisible, so a half-uploaded binary is never
-- offered to a till.
CREATE OR REPLACE FUNCTION public.terminal_current_release(p_platform_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'versionCode', r.version_code,
           'versionName', r.version_name,
           'url',         r.url,
           'sha256',      r.sha256,
           'notes',       r.notes,
           'mandatory',   r.mandatory,
           'publishedAt', r.published_at
         )
    FROM terminal_release r
   WHERE r.platform_id = p_platform_id
     AND r.published_at IS NOT NULL
   ORDER BY r.version_code DESC
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.terminal_current_release(text) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.terminal_current_release(text) TO loyalty_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON terminal_release TO loyalty_app;
  END IF;
END $$;
