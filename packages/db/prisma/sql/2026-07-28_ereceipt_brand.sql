-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: the public eReceipt page runs with no tenant GUCs, so a plain
-- `SELECT branding FROM brand` is filtered out by RLS and the merchant's
-- website/socials never render. Expose just the branding blob, by id, through a
-- SECURITY DEFINER function (same pattern as ereceipt_ad).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ereceipt_brand(p_brand_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(branding, '{}'::jsonb) FROM brand WHERE id = p_brand_id
$$;
REVOKE ALL ON FUNCTION public.ereceipt_brand(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ereceipt_brand(text) TO loyalty_app;
