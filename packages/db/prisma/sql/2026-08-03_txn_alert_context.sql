-- One lookup for everything a transaction alert needs.
--
-- The relay was claiming events and then sending nothing, because it still
-- reached for `terminal_transaction` directly to find the receipt to link to —
-- and that table is under tenant RLS too. With no tenant context the read
-- returned null, the relay decided there was no receipt to link, and held the
-- message back. Fixing `outbox` alone wasn't enough; every read on this path has
-- to come through a definer function.
--
-- Folding recipient and receipt into a single function also means the relay
-- makes one round trip instead of three, and there is exactly one place to look
-- when a message doesn't arrive.

CREATE OR REPLACE FUNCTION public.txn_alert_context(p_transaction_id text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'membershipId', cm.id,
           'personId',     p.id,
           'firstName',    COALESCE(NULLIF(split_part(NULLIF(trim(p.full_name), ''), ' ', 1), ''), 'there'),
           'phoneEnc',     encode(p.phone_enc, 'base64'),
           'brandName',    b.name,
           'pointsCode',   b.points_currency_code,
           'currency',     b.currency,
           -- First earn here decides welcome vs routine. Counted excluding this
           -- transaction, so the very first sale reads as a welcome.
           'priorEarns',   (
             SELECT count(*) FROM terminal_transaction t2
              WHERE t2.membership_id = cm.id AND t2.intent = 'earn'
                AND t2.state = 'captured' AND t2.id <> tt.id),
           -- The receipt the message links to. Receipts carry no transaction id,
           -- so they're matched on the member and the moment.
           'receiptToken', (
             SELECT r.token FROM receipt r
              WHERE r.brand_id = tt.brand_id
                AND r.membership_id = cm.id
                AND r.created_at >= tt.created_at - interval '5 minutes'
              ORDER BY r.created_at DESC LIMIT 1)
         )
    FROM terminal_transaction tt
    JOIN customer_membership cm ON cm.id = tt.membership_id
    JOIN person p ON p.id = cm.person_id
    JOIN brand b ON b.id = tt.brand_id
   WHERE tt.id = p_transaction_id
     -- Consent enforced at the source: an opted-out customer simply isn't a
     -- recipient, so no caller can message them by mistake.
     AND p.txn_alerts_opt_out = false
     AND p.phone_enc IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.txn_alert_context(text) FROM public;
GRANT EXECUTE ON FUNCTION public.txn_alert_context(text) TO loyalty_app;
