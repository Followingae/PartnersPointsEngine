-- What's on at the brands a customer already holds a card for.
--
-- Screens 74-76 are one hero in three treatments: a brand-led headline, an
-- offer, and the same thing with a countdown when it is about to end. All three
-- are the same row — an active campaign — so there is one query rather than
-- three concepts.
--
-- `sponsored` comes from the campaign's own definition and defaults to false.
-- The design labels these "Sponsored", but calling an ordinary brand promotion
-- a paid placement is a false disclosure, and the platform has no billing
-- relationship that would make it true. It says so only when it is so.

CREATE OR REPLACE FUNCTION public.wallet_offers(p_person_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    jsonb_agg(x ORDER BY (x->>'endsAt') NULLS LAST),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
             'id',        c.id,
             'brandId',   b.id,
             'brandName', b.name,
             'branding',  b.branding,
             'headline',  COALESCE(c.definition->>'headline', c.name),
             'kicker',    c.definition->>'kicker',
             'cta',       COALESCE(c.definition->>'cta', 'See offer'),
             'sponsored', COALESCE((c.definition->>'sponsored')::boolean, false),
             'endsAt',    c.ends_at
           ) AS x
      FROM campaign c
      JOIN brand b ON b.id = c.brand_id
      JOIN customer_membership m ON m.brand_id = b.id
     WHERE m.person_id = p_person_id
       AND c.enabled
       AND (c.starts_at IS NULL OR c.starts_at <= now())
       AND (c.ends_at IS NULL OR c.ends_at > now())
     LIMIT 10
  ) s
$$;

REVOKE ALL ON FUNCTION public.wallet_offers(text) FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    GRANT EXECUTE ON FUNCTION public.wallet_offers(text) TO loyalty_app;
  END IF;
END $$;
