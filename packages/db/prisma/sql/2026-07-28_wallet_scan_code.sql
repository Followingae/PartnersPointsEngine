-- The app shows a QR at the till, and the terminal resolves it by hashing the
-- scanned value against customer_identifier. But at-till enrolment only ever
-- creates a 'phone' identifier, so a code shown by the app matched nothing and
-- the customer could not be recognised from their own app.
--
-- The value is the membership's loyalty_id: it already exists, is already the
-- customer's card number, and is stored in the clear, so it can be handed back
-- on every launch (identifiers keep only a hash). Registering it under type
-- 'qr' means terminals already in the field resolve it with no change.

CREATE OR REPLACE FUNCTION public.wallet_scan_code(p_person_id text, p_brand_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record;
BEGIN
  SELECT cm.id, cm.loyalty_id, cm.brand_id, cm.group_id, cm.platform_id
    INTO m
    FROM customer_membership cm
   WHERE cm.person_id = p_person_id
     AND cm.brand_id = p_brand_id
     AND cm.status = 'active';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- sha256() is built in from Postgres 11; digest() would need pgcrypto, which
  -- isn't guaranteed to be installed.
  INSERT INTO customer_identifier (id, membership_id, brand_id, group_id, platform_id, type, value_hash, created_at)
  VALUES (
    gen_random_uuid()::text, m.id, m.brand_id, m.group_id, m.platform_id,
    'qr', encode(sha256(m.loyalty_id::bytea), 'hex'), now()
  )
  ON CONFLICT (brand_id, type, value_hash) DO NOTHING;

  RETURN jsonb_build_object(
    'value', m.loyalty_id,
    'loyaltyId', m.loyalty_id,
    'membershipId', m.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_scan_code(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.wallet_scan_code(text, text) TO loyalty_app;
