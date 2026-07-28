-- Discover lists brands to join, but the only way to become a member was a
-- cashier enrolling you at a till — so tapping "Join" had nowhere to go.
--
-- Joining creates the membership and the identifiers the tills resolve against
-- (the person's phone, and the loyalty id shown as a QR), which is what makes a
-- customer who joined in the app recognisable in a shop.

CREATE OR REPLACE FUNCTION public.wallet_join_brand(p_person_id text, p_brand_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  p record;
  existing customer_membership%ROWTYPE;
  new_id text;
  new_loyalty text;
BEGIN
  SELECT id, group_id, platform_id, name INTO b
    FROM brand WHERE id = p_brand_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'brand not found');
  END IF;

  SELECT id, platform_id, phone_hash INTO p FROM person WHERE id = p_person_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'person not found');
  END IF;
  -- A brand belongs to one platform; a person cannot join across platforms.
  IF p.platform_id <> b.platform_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'brand not available');
  END IF;

  SELECT * INTO existing FROM customer_membership
   WHERE person_id = p_person_id AND brand_id = p_brand_id;

  IF FOUND THEN
    -- Re-joining a card they already hold is a no-op, not an error.
    IF existing.status <> 'active' THEN
      UPDATE customer_membership SET status = 'active' WHERE id = existing.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'membershipId', existing.id,
                              'loyaltyId', existing.loyalty_id, 'alreadyMember', true);
  END IF;

  new_id := gen_random_uuid()::text;
  new_loyalty := 'PP-' || upper(substr(md5(new_id), 1, 8));

  -- updated_at is Prisma-managed and has no database default, so a raw insert
  -- has to set it.
  INSERT INTO customer_membership
    (id, person_id, brand_id, group_id, platform_id, loyalty_id, status, joined_at, created_at, updated_at)
  VALUES
    (new_id, p_person_id, b.id, b.group_id, b.platform_id, new_loyalty, 'active', now(), now(), now());

  -- The QR the app shows, so a till can recognise them from day one.
  INSERT INTO customer_identifier (id, membership_id, brand_id, group_id, platform_id, type, value_hash, created_at)
  VALUES (gen_random_uuid()::text, new_id, b.id, b.group_id, b.platform_id,
          'qr', encode(sha256(new_loyalty::bytea), 'hex'), now())
  ON CONFLICT (brand_id, type, value_hash) DO NOTHING;

  -- And their phone, so giving the number at the till finds them too.
  IF p.phone_hash IS NOT NULL THEN
    INSERT INTO customer_identifier (id, membership_id, brand_id, group_id, platform_id, type, value_hash, created_at)
    VALUES (gen_random_uuid()::text, new_id, b.id, b.group_id, b.platform_id,
            'phone', p.phone_hash, now())
    ON CONFLICT (brand_id, type, value_hash) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'membershipId', new_id,
                            'loyaltyId', new_loyalty, 'alreadyMember', false);
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_join_brand(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.wallet_join_brand(text, text) TO loyalty_app;
