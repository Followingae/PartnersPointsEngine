-- Pass data, readable without a tenant context.
--
-- Building a pass needs the membership, its brand, the balance, the tier and
-- the stamp card — five tables, every one of them under tenant RLS. The wallet
-- surface is person-scoped and has no tenant to run as, so reading them
-- directly returns nothing and the pass endpoint answered 404 for every card
-- that plainly existed.
--
-- Same reason the rest of the customer wallet goes through wallet_* definer
-- functions. This is that, for passes.
--
-- p_person_id is optional. The app passes it and gets an ownership check; the
-- PassKit web service has only a serial number, because there the pass's own
-- authentication token is what proves the caller may see it.
CREATE OR REPLACE FUNCTION public.wallet_pass_data(
  p_membership_id text,
  p_person_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m           RECORD;
  b           RECORD;
  v_balance   bigint;
  v_lifetime  bigint;
  v_tier      text;
  v_stamp     RECORD;
  v_reward    text;
BEGIN
  SELECT cm.id, cm.loyalty_id, cm.brand_id, cm.created_at, cm.person_id
    INTO m
    FROM customer_membership cm
   WHERE cm.id = p_membership_id
     AND (p_person_id IS NULL OR cm.person_id = p_person_id);
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT br.name, br.points_currency_code, br.branding INTO b
    FROM brand br WHERE br.id = m.brand_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(ab.posted_credits - ab.posted_debits - ab.pending_debits, 0),
         COALESCE(ab.posted_credits, 0)
    INTO v_balance, v_lifetime
    FROM ledger_account la JOIN account_balance ab ON ab.account_id = la.id
   WHERE la.account_type = 'points_liability' AND la.customer_id = m.id
   LIMIT 1;

  SELECT t.name INTO v_tier FROM tier t
   WHERE t.brand_id = m.brand_id AND t.threshold <= COALESCE(v_lifetime, 0)
   ORDER BY t.threshold DESC LIMIT 1;

  -- The stamp card worth showing is whichever repeatable visits challenge the
  -- member is furthest through: a pass has room for one.
  SELECT cp.progress, c.target, c.reward_item_id INTO v_stamp
    FROM challenge_progress cp JOIN challenge c ON c.id = cp.challenge_id
   WHERE cp.membership_id = m.id AND c.brand_id = m.brand_id
     AND c.enabled AND c.repeatable AND c.kind = 'visits'
   ORDER BY cp.progress DESC LIMIT 1;

  IF v_stamp.reward_item_id IS NOT NULL THEN
    SELECT r.name INTO v_reward FROM reward_catalog_item r WHERE r.id = v_stamp.reward_item_id;
  END IF;

  RETURN jsonb_build_object(
    'membershipId', m.id,
    'brandId',      m.brand_id,
    'brandName',    b.name,
    'loyaltyId',    m.loyalty_id,
    'pointsCode',   b.points_currency_code,
    'balance',      COALESCE(v_balance, 0)::text,
    'tier',         v_tier,
    'branding',     b.branding,
    'createdAt',    m.created_at,
    'memberName',   (SELECT p.full_name FROM person p WHERE p.id = m.person_id),
    'stamps',       CASE WHEN v_stamp.target IS NULL THEN NULL ELSE jsonb_build_object(
                      'collected', v_stamp.progress,
                      'target',    v_stamp.target,
                      'rewardName', v_reward) END
  );
END $$;

REVOKE ALL ON FUNCTION public.wallet_pass_data(text, text) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.wallet_pass_data(text, text) TO loyalty_app;
  END IF;
END $$;
