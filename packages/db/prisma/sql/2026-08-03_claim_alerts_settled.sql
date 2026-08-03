-- One sale can produce two events — a redemption captured and points earned on
-- the same purchase — and the customer was getting a WhatsApp for each. One
-- sale should be one message.
--
-- Merging them requires seeing both at once, so the relay now only claims events
-- that have had a moment to settle. Without that, a poll landing between the two
-- writes would take the earn, send it, and leave the redemption to arrive on its
-- own a few seconds later — exactly the problem being fixed.
--
-- The delay is small enough that an alert still feels immediate.

DROP FUNCTION IF EXISTS public.claim_txn_alerts(int);
-- And the two-argument form this file itself creates. Without this line the
-- script runs exactly once: a second run finds the function it just made and
-- fails with "already exists". That is fine for a migration applied by hand,
-- and fatal for one applied on every container start — which is now how this
-- reaches production.
DROP FUNCTION IF EXISTS public.claim_txn_alerts(int, int);

CREATE FUNCTION public.claim_txn_alerts(p_limit int, p_settle_seconds int DEFAULT 20)
RETURNS TABLE (id text, event_type text, payload jsonb, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE outbox SET published_at = now(), attempts = attempts + 1
   WHERE outbox.id IN (
     SELECT o.id FROM outbox o
      WHERE o.published_at IS NULL
        AND o.aggregate = 'points'
        -- Old enough that everything from the same sale has landed.
        AND o.created_at <= now() - make_interval(secs => GREATEST(p_settle_seconds, 0))
      ORDER BY o.created_at
      LIMIT GREATEST(p_limit, 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING outbox.id, outbox.event_type, outbox.payload, outbox.created_at;
$$;

REVOKE ALL ON FUNCTION public.claim_txn_alerts(int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_txn_alerts(int, int) TO loyalty_app;
