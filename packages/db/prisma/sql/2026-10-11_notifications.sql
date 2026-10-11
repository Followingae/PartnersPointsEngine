-- Operator notification centre.
--
-- A generic, server-driven notification feed for console operators (brand admins
-- and superadmins). Any backend event publishes into `notification`; the fraud
-- module is the first producer. The consoles poll an unread count and render a
-- bell + dropdown + a full notification page. This is distinct from
-- `notification_template` (brand -> end-customer messaging) and from the
-- in-session toast (client-only feedback): this is "something happened that an
-- operator should see", persisted and surfaced in-app.
--
-- Scoping rides the standard tenant_isolation RLS. A brand principal sets ONLY
-- its brand GUC, so:
--   * brand-audience rows carry brand_id = X  -> the brand sees them (brand GUC),
--     and a superadmin sees them too (platform GUC).
--   * platform-audience rows carry brand_id = NULL, platform_id = P -> only a
--     superadmin (platform scope) matches; a brand principal never does.
-- The brand a platform-audience row concerns is carried in `data` (not in the
-- RLS brand_id column), so it stays invisible to that brand.
--
-- Read state is per-user (a brand can have several admins): `notification_read`
-- records who has dismissed which notification. Unread = visible notifications
-- minus this user's read rows. Idempotent throughout.

-- ── notification ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  platform_id   TEXT NOT NULL,
  group_id      TEXT,
  brand_id      TEXT,                                     -- NULL => platform-audience (RLS: brands never match)
  audience      TEXT NOT NULL CHECK (audience IN ('brand','platform')),
  source        TEXT NOT NULL,                            -- 'fraud' | 'settlement' | 'system' | ...
  category      TEXT NOT NULL DEFAULT 'alert',
  severity      TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  link          TEXT,                                     -- deep-link path within the console
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    TEXT,                                     -- collapse repeats of the same event
  related_id    TEXT,                                     -- e.g. the fraud_alert id
  created_at    TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notification_brand    ON public.notification (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notification_platform ON public.notification (platform_id, audience, created_at DESC);
-- One row per (scope, audience, dedupe_key) when a dedupe key is supplied.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_dedupe
  ON public.notification (platform_id, audience, COALESCE(brand_id,''), dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ── notification_read (per operator) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_read (
  notification_id TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  platform_id     TEXT NOT NULL,
  group_id        TEXT,
  brand_id        TEXT,
  read_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_notification_read_user ON public.notification_read (user_id);

-- ── RLS (standard tenant_isolation, same shape as fraud_module.sql / rls.sql) ─
DO $$
DECLARE
  t text;
  expr text := $expr$
    brand_id = nullif(current_setting('app.current_brand_id', true), '')
    OR group_id = nullif(current_setting('app.current_group_id', true), '')
    OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
  $expr$;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    FOREACH t IN ARRAY ARRAY['notification','notification_read'] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO loyalty_app USING (%s) WITH CHECK (%s)',
        t, expr, expr
      );
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO loyalty_app', t);
    END LOOP;
  END IF;
END $$;
