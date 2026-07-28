-- ─────────────────────────────────────────────────────────────────────────────
-- 1) FIX: brand principals (terminals, brand console) could not read the people
--    who are members of their own brand — person is platform-scoped and the
--    fail-closed TenantService never sets app.current_platform_id for brand
--    scope. Result in prod: member names invisible (terminal member/context
--    500s; console Customer 360 blank names). New policy: platform match OR
--    membership-in-current-scope match. Fail-closed posture is preserved — a
--    brand still sees only its own members.
-- 2) Terminal enrollment: SECURITY DEFINER get-or-create person (a brand
--    principal cannot INSERT a platform-scoped person row directly).
-- 3) eReceipts: public-by-token receipt records + view/click counters.
-- Safe to run against prod: additive + one policy replacement.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ── person policy ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON public.person;
CREATE POLICY tenant_isolation ON public.person FOR ALL TO loyalty_app
  USING (
    platform_id = nullif(current_setting('app.current_platform_id', true), '')
    OR EXISTS (
      SELECT 1 FROM public.customer_membership cm
      WHERE cm.person_id = person.id
        AND (
          cm.brand_id = nullif(current_setting('app.current_brand_id', true), '')
          OR cm.group_id = nullif(current_setting('app.current_group_id', true), '')
        )
    )
  )
  WITH CHECK (
    platform_id = nullif(current_setting('app.current_platform_id', true), '')
    OR EXISTS (
      SELECT 1 FROM public.customer_membership cm
      WHERE cm.person_id = person.id
        AND (
          cm.brand_id = nullif(current_setting('app.current_brand_id', true), '')
          OR cm.group_id = nullif(current_setting('app.current_group_id', true), '')
        )
    )
  );

-- 2 ── terminal enrollment (get-or-create person by phone hash) ───────────────
CREATE OR REPLACE FUNCTION public.terminal_enroll_person(
  p_platform_id text,
  p_phone_hash text,
  p_phone_enc bytea,
  p_full_name text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id text;
BEGIN
  SELECT id INTO v_id FROM person WHERE phone_hash = p_phone_hash;
  IF v_id IS NOT NULL THEN
    -- backfill a name if we never had one; never overwrite an existing name
    IF p_full_name IS NOT NULL THEN
      UPDATE person SET full_name = p_full_name, updated_at = now()
      WHERE id = v_id AND full_name IS NULL;
    END IF;
    RETURN v_id;
  END IF;
  v_id := gen_random_uuid()::text;
  INSERT INTO person (id, platform_id, phone_hash, phone_enc, full_name, status, created_at, updated_at)
  VALUES (v_id, p_platform_id, p_phone_hash, p_phone_enc, p_full_name, 'active', now(), now());
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.terminal_enroll_person(text, text, bytea, text) FROM public;
GRANT EXECUTE ON FUNCTION public.terminal_enroll_person(text, text, bytea, text) TO loyalty_app;

-- 3 ── eReceipts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "receipt" (
  "id"             TEXT NOT NULL,
  "token"          TEXT NOT NULL,
  "brand_id"       TEXT NOT NULL,
  "group_id"       TEXT NOT NULL,
  "platform_id"    TEXT NOT NULL,
  "terminal_id"    TEXT,
  "membership_id"  TEXT,
  "brand_name"     TEXT NOT NULL DEFAULT 'Partners Points',
  "brand_color"    TEXT,
  "kind"           TEXT NOT NULL DEFAULT 'sale',
  "order_no"       TEXT NOT NULL,
  "gross_minor"    BIGINT NOT NULL DEFAULT 0,
  "discount_minor" BIGINT NOT NULL DEFAULT 0,
  "net_minor"      BIGINT NOT NULL DEFAULT 0,
  "currency"       TEXT NOT NULL DEFAULT 'AED',
  "payment_method" TEXT NOT NULL DEFAULT 'card',
  "masked_pan"     TEXT,
  "auth_no"        TEXT,
  "member_name"    TEXT,
  "earned_points"  BIGINT NOT NULL DEFAULT 0,
  "redeemed_points" BIGINT NOT NULL DEFAULT 0,
  "balance_after"  BIGINT,
  "points_code"    TEXT NOT NULL DEFAULT 'PTS',
  "view_count"     INTEGER NOT NULL DEFAULT 0,
  "ad_clicks"      INTEGER NOT NULL DEFAULT 0,
  "first_viewed_at" TIMESTAMP(3),
  "last_viewed_at"  TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "receipt_token_key" ON "receipt"("token");
CREATE INDEX IF NOT EXISTS "receipt_brand_id_created_at_idx" ON "receipt"("brand_id", "created_at");

-- Deliberately NOT RLS-gated by tenant: the unguessable token IS the capability
-- (public eReceipt link). Writes go through the HMAC-authed terminal surface;
-- the public read path touches only by-token lookups.
GRANT SELECT, INSERT, UPDATE ON "receipt" TO loyalty_app;

-- Public eReceipt ad slot: reads platform.settings->'eReceiptAd' without a
-- tenant context (platform table is RLS-gated; the public page has no GUCs).
CREATE OR REPLACE FUNCTION public.ereceipt_ad(p_platform_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(settings->'eReceiptAd', 'null'::jsonb) FROM platform WHERE id = p_platform_id
$$;
REVOKE ALL ON FUNCTION public.ereceipt_ad(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ereceipt_ad(text) TO loyalty_app;
