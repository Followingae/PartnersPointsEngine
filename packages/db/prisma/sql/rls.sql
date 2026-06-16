-- ─────────────────────────────────────────────────────────────────────────────
-- RFM Loyalty Engine — Row-Level Security (Phase 1)
-- Apply AFTER the Prisma baseline migration (tables must already exist).
--
-- Model:
--   * The request path connects as a dedicated NON-OWNER role `loyalty_app`
--     and sets tenant context with `SET LOCAL app.current_*` inside each request
--     transaction (transaction-pooler safe).
--   * RLS is ENABLED (not FORCED): the table OWNER (migrator/seed) bypasses RLS;
--     `loyalty_app` (non-owner) is fully enforced. Runtime always uses loyalty_app.
--   * Policies are HIERARCHICAL but FAIL-CLOSED: a principal sets ONLY the GUC for
--     its scope level. A brand principal sets app.current_brand_id only, so the
--     group/platform clauses are NULL and it can NEVER reach another brand.
--   * `nullif(current_setting(...,true),'')` yields NULL when the context is
--     unset or empty ⇒ the comparison is NULL ⇒ zero rows (fail closed), and never
--     attempts to cast '' to uuid.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) App role (created NOLOGIN here; grant LOGIN + password out-of-band for the
--    runtime connection string, or connect via the Supabase pooler as this role).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    CREATE ROLE loyalty_app NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Allow whoever applies this migration to SET ROLE loyalty_app (for tests / dev).
DO $$
BEGIN
  EXECUTE format('GRANT loyalty_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

GRANT USAGE ON SCHEMA public TO loyalty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loyalty_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loyalty_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loyalty_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO loyalty_app;

-- The app role must never touch Prisma's migration bookkeeping (if present).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
  ) THEN
    EXECUTE 'REVOKE ALL ON TABLE public._prisma_migrations FROM loyalty_app';
  END IF;
END $$;

-- Fail-closed defaults (applied when a real login connects AS loyalty_app).
ALTER ROLE loyalty_app SET app.current_platform_id = '';
ALTER ROLE loyalty_app SET app.current_group_id = '';
ALTER ROLE loyalty_app SET app.current_brand_id = '';
ALTER ROLE loyalty_app SET app.current_branch_id = '';
ALTER ROLE loyalty_app SET app.current_actor_id = '';
ALTER ROLE loyalty_app SET app.current_surface = '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Brand-hierarchy tables (carry brand_id, group_id, platform_id).
--    Visible to a brand principal (own brand), a group principal (its brands),
--    or a platform principal (everything in the platform).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  expr text := $expr$
    brand_id = nullif(current_setting('app.current_brand_id', true), '')
    OR group_id = nullif(current_setting('app.current_group_id', true), '')
    OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
  $expr$;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branch','terminal','api_key','role_assignment',
    'customer_membership','customer_identifier',
    'outbox','idempotency_key','audit_log',
    'ledger_account','journal','entry','account_balance',
    'earn_rule','tier','reward_catalog_item','voucher',
    'terminal_transaction',
    'campaign','badge','badge_award','challenge','challenge_progress',
    'referral','webhook_endpoint','webhook_delivery',
    'brand_daily_metric','rfm_snapshot',
    'governance_config','change_request',
    'coupon','coupon_redemption','segment','notification_template'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO loyalty_app USING (%s) WITH CHECK (%s)',
      t, expr, expr
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Tenant nodes whose OWN id is the scope key.
-- ─────────────────────────────────────────────────────────────────────────────

-- platform: only a platform principal.
ALTER TABLE public.platform ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.platform;
CREATE POLICY tenant_isolation ON public.platform FOR ALL TO loyalty_app
USING (id = nullif(current_setting('app.current_platform_id', true), ''))
WITH CHECK (id = nullif(current_setting('app.current_platform_id', true), ''));

-- tenant_group: own group, or platform sees all groups.
ALTER TABLE public.tenant_group ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.tenant_group;
CREATE POLICY tenant_isolation ON public.tenant_group FOR ALL TO loyalty_app
USING (
  id = nullif(current_setting('app.current_group_id', true), '')
  OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
)
WITH CHECK (
  id = nullif(current_setting('app.current_group_id', true), '')
  OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
);

-- brand: own brand, or group sees its brands, or platform sees all.
ALTER TABLE public.brand ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.brand;
CREATE POLICY tenant_isolation ON public.brand FOR ALL TO loyalty_app
USING (
  id = nullif(current_setting('app.current_brand_id', true), '')
  OR group_id = nullif(current_setting('app.current_group_id', true), '')
  OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
)
WITH CHECK (
  id = nullif(current_setting('app.current_brand_id', true), '')
  OR group_id = nullif(current_setting('app.current_group_id', true), '')
  OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Platform-scoped identity tables (managed under platform context).
--    NOTE: the login/refresh/OTP paths use a privileged auth connection (owner)
--    for pre-context credential lookups; these policies protect any access made
--    through the enforced app role.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  expr text := $expr$
    platform_id = nullif(current_setting('app.current_platform_id', true), '')
  $expr$;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_account','refresh_token','person'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO loyalty_app USING (%s) WITH CHECK (%s)',
      t, expr, expr
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b) Group-scoped tables (group_id + platform_id, no brand): wallet config.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  expr text := $expr$
    group_id = nullif(current_setting('app.current_group_id', true), '')
    OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
  $expr$;
BEGIN
  FOREACH t IN ARRAY ARRAY['group_wallet','cost_rule'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO loyalty_app USING (%s) WITH CHECK (%s)',
      t, expr, expr
    );
  END LOOP;
END $$;

-- Reference tables (rbac_role, rbac_permission, rbac_role_permission,
-- impersonation_session) are intentionally NOT under RLS in Phase 1: role/perm
-- definitions are non-tenant-sensitive; impersonation is superadmin-only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Append-only enforcement for the immutable audit log.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %.% cannot be UPDATEd or DELETEd',
    TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS no_mutation ON public.audit_log;
CREATE TRIGGER no_mutation
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
