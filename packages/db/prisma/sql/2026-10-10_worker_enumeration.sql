-- Fix: background jobs never run under the non-owner `loyalty_app` role.
--
-- WorkerRunner.perBrand/perGroup enumerated brands/groups through the normal
-- RLS-scoped client with NO tenant GUC set, so every tenant_isolation policy
-- predicate was `= NULL` and matched zero rows: settlement, point-expiry,
-- webhook relay and account-deletion silently processed nothing in production.
-- The authors hit the same wall for the txn-alert outbox and solved it with a
-- SECURITY DEFINER claim function; the per-brand/per-group loops never got the
-- equivalent. These are those equivalents.
--
-- SECURITY DEFINER + a pinned search_path so the function body cannot be
-- hijacked by a caller-controlled schema. EXECUTE is granted only to the app
-- role. The functions return exactly the columns the scheduler needs and
-- nothing else; they are enumeration-only (no writes).
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.worker_active_brands()
RETURNS TABLE (id text, group_id text, platform_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.group_id, b.platform_id
    FROM public.brand b
   WHERE b.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.worker_active_groups()
RETURNS TABLE (id text, platform_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.platform_id
    FROM public.tenant_group g
   WHERE g.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.worker_active_brands() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.worker_active_groups() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.worker_active_brands() TO loyalty_app;
    GRANT EXECUTE ON FUNCTION public.worker_active_groups() TO loyalty_app;
  END IF;
END $$;
