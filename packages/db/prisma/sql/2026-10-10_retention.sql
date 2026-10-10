-- Data retention / purge. Nothing was ever deleted: refresh tokens, outbox,
-- webhook deliveries, idempotency keys and OTP rows grew without bound (a
-- storage and privacy problem — PDPL data minimisation). `otp_prune()` existed
-- but was never called.
--
-- One SECURITY DEFINER entry point the scheduler calls; it purges by age across
-- tenants (a platform-wide housekeeping job, inherently cross-tenant, so it
-- cannot run under a single tenant's RLS context — same reason the worker
-- enumerators are definer functions). audit_log is deliberately NOT purged: it
-- is a tamper-evident chain and its retention is a separate, policy-driven
-- decision. Returns a row of counts for observability.
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.run_retention()
RETURNS TABLE (
  refresh_tokens integer,
  otp_codes integer,
  outbox_rows integer,
  webhook_deliveries integer,
  idempotency_keys integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_refresh integer := 0;
  c_otp integer := 0;
  c_outbox integer := 0;
  c_webhook integer := 0;
  c_idem integer := 0;
BEGIN
  -- Refresh tokens: gone once expired, or revoked more than 7 days ago.
  DELETE FROM public.refresh_token
   WHERE expires_at < now()
      OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days');
  GET DIAGNOSTICS c_refresh = ROW_COUNT;

  -- OTP codes: short-lived; purge anything older than a day.
  DELETE FROM public.otp_code WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS c_otp = ROW_COUNT;

  -- Outbox: published rows older than 30 days (unpublished rows are never touched).
  DELETE FROM public.outbox
   WHERE published_at IS NOT NULL AND published_at < now() - interval '30 days';
  GET DIAGNOSTICS c_outbox = ROW_COUNT;

  -- Webhook deliveries in a terminal state (delivered/dead) older than 30 days.
  DELETE FROM public.webhook_delivery
   WHERE status IN ('delivered', 'dead', 'failed')
     AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS c_webhook = ROW_COUNT;

  -- Completed idempotency keys older than 30 days (the replay window is long
  -- closed; the stored response is no longer needed).
  DELETE FROM public.idempotency_key
   WHERE status = 'done' AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS c_idem = ROW_COUNT;

  RETURN QUERY SELECT c_refresh, c_otp, c_outbox, c_webhook, c_idem;
END;
$$;

REVOKE ALL ON FUNCTION public.run_retention() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.run_retention() TO loyalty_app;
  END IF;
END $$;
