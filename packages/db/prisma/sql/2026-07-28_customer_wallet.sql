-- The customer app is a multi-brand wallet, but every customer token is scoped
-- to a single brand and RLS isolates loyalty data by brand_id. A person-level
-- read therefore has no tenant context to run under and would be filtered to
-- nothing — the same problem the eReceipt page hit.
--
-- Same remedy: SECURITY DEFINER functions keyed by person_id. They are the only
-- way to see across a person's brands, they never take a brand from the caller,
-- and they are granted solely to the app role.

-- ── cards ───────────────────────────────────────────────────────────────────
-- Every membership this person holds, with the brand's identity, live balance
-- and current tier. Tier is derived the same way the loyalty service derives it:
-- the highest tier whose threshold the lifetime points have reached.
CREATE OR REPLACE FUNCTION public.wallet_cards(p_person_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(card ORDER BY card->>'joinedAt'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
             'membershipId', cm.id,
             'brandId',      b.id,
             'brandName',    b.name,
             'brandSlug',    b.slug,
             'branding',     b.branding,
             'pointsCode',   b.points_currency_code,
             'currency',     b.currency,
             'loyaltyId',    cm.loyalty_id,
             'status',       cm.status,
             'joinedAt',     cm.joined_at,
             'available',    COALESCE(bal.available, 0)::text,
             'lifetime',     COALESCE(bal.lifetime, 0)::text,
             'tier',         t.name,
             'tierThreshold', COALESCE(t.threshold, 0)::text,
             'nextTier',     nt.name,
             'nextTierThreshold', nt.threshold::text
           ) AS card
    FROM customer_membership cm
    JOIN brand b ON b.id = cm.brand_id
    LEFT JOIN LATERAL (
      SELECT (ab.posted_credits - ab.posted_debits - ab.pending_debits) AS available,
             ab.posted_credits AS lifetime
        FROM ledger_account la
        JOIN account_balance ab ON ab.account_id = la.id
       WHERE la.account_type = 'points_liability'
         AND la.customer_id = cm.id
       LIMIT 1
    ) bal ON TRUE
    LEFT JOIN LATERAL (
      SELECT tr.name, tr.threshold
        FROM tier tr
       WHERE tr.brand_id = cm.brand_id
         AND tr.threshold <= COALESCE(bal.lifetime, 0)
       ORDER BY tr.threshold DESC
       LIMIT 1
    ) t ON TRUE
    LEFT JOIN LATERAL (
      SELECT tr.name, tr.threshold
        FROM tier tr
       WHERE tr.brand_id = cm.brand_id
         AND tr.threshold > COALESCE(bal.lifetime, 0)
       ORDER BY tr.threshold ASC
       LIMIT 1
    ) nt ON TRUE
    WHERE cm.person_id = p_person_id
      AND cm.status = 'active'
      AND b.status = 'active'
  ) cards
$$;

-- ── vouchers ────────────────────────────────────────────────────────────────
-- Rewards the person holds across every brand. 'reserved' reads as still theirs:
-- a sale in progress has not spent it yet.
CREATE OR REPLACE FUNCTION public.wallet_vouchers(p_person_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(v ORDER BY v->>'issuedAt' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
             'id',          vo.id,
             'code',        vo.code,
             'status',      vo.status::text,
             'brandId',     b.id,
             'brandName',   b.name,
             'branding',    b.branding,
             'rewardName',  COALESCE(ci.name, 'Reward'),
             'discountMinor', COALESCE((ci.payload->>'discountMinor')::int, 0),
             'currency',    b.currency,
             'pointsSpent', vo.points_spent::text,
             'issuedAt',    vo.created_at,
             'expiresAt',   vo.expires_at,
             'redeemedAt',  vo.redeemed_at
           ) AS v
    FROM voucher vo
    JOIN customer_membership cm ON cm.id = vo.membership_id
    JOIN brand b ON b.id = vo.brand_id
    LEFT JOIN reward_catalog_item ci ON ci.id = vo.catalog_item_id
    WHERE cm.person_id = p_person_id
  ) rows
$$;

-- ── activity ────────────────────────────────────────────────────────────────
-- Points movements across every brand. Reward events are merged in by the API
-- from wallet_vouchers, so this returns ledger rows only.
CREATE OR REPLACE FUNCTION public.wallet_activity(p_person_id text, p_limit int)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(e ORDER BY e->>'occurredAt' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
             'journalId',  j.id,
             'kind',       j.kind::text,
             'direction',  en.direction::text,
             'amount',     en.amount_minor::text,
             'occurredAt', j.occurred_at,
             'brandId',    b.id,
             'brandName',  b.name
           ) AS e
    FROM entry en
    JOIN journal j ON j.id = en.journal_id
    JOIN ledger_account la ON la.id = en.account_id
    JOIN customer_membership cm ON cm.id = la.customer_id
    JOIN brand b ON b.id = cm.brand_id
    WHERE la.account_type = 'points_liability'
      AND cm.person_id = p_person_id
    ORDER BY j.occurred_at DESC, j.id DESC
    LIMIT GREATEST(p_limit, 1)
  ) rows
$$;

-- ── profile ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_profile(p_person_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'id',        p.id,
           'fullName',  p.full_name,
           'gender',    p.gender,
           'birthdate', p.birthdate,
           'status',    p.status::text,
           'joinedAt',  p.created_at,
           'phoneEnc',  encode(p.phone_enc, 'base64'),
           'emailEnc',  encode(p.email_enc, 'base64')
         )
    FROM person p WHERE p.id = p_person_id
$$;

CREATE OR REPLACE FUNCTION public.wallet_update_profile(
  p_person_id text, p_full_name text, p_gender text, p_birthdate date
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE person SET
    full_name = COALESCE(p_full_name, full_name),
    gender    = COALESCE(p_gender, gender),
    birthdate = COALESCE(p_birthdate, birthdate)
  WHERE id = p_person_id
  RETURNING jsonb_build_object('id', id, 'fullName', full_name);
$$;

-- ── discover ────────────────────────────────────────────────────────────────
-- Brands the person could join, so the app can show somewhere to go when the
-- wallet is empty. Identity only — no member data crosses this boundary.
CREATE OR REPLACE FUNCTION public.wallet_discoverable_brands(p_person_id text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(b ORDER BY b->>'name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
             'brandId',    br.id,
             'brandName',  br.name,
             'brandSlug',  br.slug,
             'branding',   br.branding,
             'pointsCode', br.points_currency_code,
             'joined',     EXISTS (
               SELECT 1 FROM customer_membership cm
                WHERE cm.brand_id = br.id AND cm.person_id = p_person_id
                  AND cm.status = 'active')
           ) AS b
    FROM brand br
    WHERE br.status = 'active'
  ) rows
$$;

-- ── person lookup by phone (sign-in) ─────────────────────────────────────────
-- Sign-in must work before any brand is known, so it cannot run under RLS.
CREATE OR REPLACE FUNCTION public.wallet_person_by_phone(p_phone_hash text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'id', p.id,
           'platformId', p.platform_id,
           'fullName', p.full_name,
           'memberships', (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'membershipId', cm.id, 'brandId', cm.brand_id,
                      'groupId', cm.group_id, 'platformId', cm.platform_id,
                      'brandName', b.name, 'status', cm.status::text)), '[]'::jsonb)
               FROM customer_membership cm
               JOIN brand b ON b.id = cm.brand_id
              WHERE cm.person_id = p.id AND cm.status = 'active')
         )
    FROM person p WHERE p.phone_hash = p_phone_hash
$$;

REVOKE ALL ON FUNCTION public.wallet_cards(text) FROM public;
REVOKE ALL ON FUNCTION public.wallet_vouchers(text) FROM public;
REVOKE ALL ON FUNCTION public.wallet_activity(text, int) FROM public;
REVOKE ALL ON FUNCTION public.wallet_profile(text) FROM public;
REVOKE ALL ON FUNCTION public.wallet_update_profile(text, text, text, date) FROM public;
REVOKE ALL ON FUNCTION public.wallet_discoverable_brands(text) FROM public;
REVOKE ALL ON FUNCTION public.wallet_person_by_phone(text) FROM public;

GRANT EXECUTE ON FUNCTION public.wallet_cards(text) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.wallet_vouchers(text) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.wallet_activity(text, int) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.wallet_profile(text) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.wallet_update_profile(text, text, text, date) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.wallet_discoverable_brands(text) TO loyalty_app;
GRANT EXECUTE ON FUNCTION public.wallet_person_by_phone(text) TO loyalty_app;
