-- The alert relay found nothing to send, because `outbox` is under
-- tenant_isolation RLS and the relay runs with no tenant context — it works
-- across every brand by design, so there is no single tenant to scope it to.
-- With the GUCs unset the policy filtered every row out and the relay quietly
-- did nothing, which is exactly how it looked in production: rows sitting
-- unpublished with attempts = 0.
--
-- Same remedy as the other cross-tenant readers (eReceipt page, wallet, terminal
-- enrolment): a SECURITY DEFINER function, granted only to the app role.
--
-- Claiming and marking published happen in one statement. FOR UPDATE SKIP LOCKED
-- means two API instances polling together each take different rows, so no
-- customer is messaged twice; and publishing before the send means a crash
-- mid-flight loses a message rather than repeating it — the safer direction for
-- something that arrives on a phone.

CREATE OR REPLACE FUNCTION public.claim_txn_alerts(p_limit int)
RETURNS TABLE (id text, event_type text, payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE outbox SET published_at = now(), attempts = attempts + 1
   WHERE outbox.id IN (
     SELECT o.id FROM outbox o
      WHERE o.published_at IS NULL
        AND o.aggregate = 'points'
      ORDER BY o.created_at
      LIMIT GREATEST(p_limit, 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING outbox.id, outbox.event_type, outbox.payload;
$$;

REVOKE ALL ON FUNCTION public.claim_txn_alerts(int) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_txn_alerts(int) TO loyalty_app;
