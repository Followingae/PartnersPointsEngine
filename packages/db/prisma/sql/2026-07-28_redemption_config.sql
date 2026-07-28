-- ─────────────────────────────────────────────────────────────────────────────
-- Additive migration: RedemptionConfig (brand-level "pay with points" valuation)
-- Safe to run against prod: only CREATEs, no destructive changes.
-- rls.sql also lists redemption_config for future full re-applies.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "redemption_config" (
  "id"                      TEXT NOT NULL,
  "brand_id"                TEXT NOT NULL,
  "group_id"                TEXT NOT NULL,
  "platform_id"             TEXT NOT NULL,
  "enabled"                 BOOLEAN NOT NULL DEFAULT true,
  "rate_points"             BIGINT NOT NULL DEFAULT 100,
  "rate_value_minor"        BIGINT NOT NULL DEFAULT 100,
  "min_redeem_points"       BIGINT NOT NULL DEFAULT 0,
  "max_percent_of_bill_bps" INTEGER NOT NULL DEFAULT 10000,
  "round_to_minor"          INTEGER NOT NULL DEFAULT 1,
  "presets_points"          JSONB NOT NULL DEFAULT '[]',
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "redemption_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "redemption_config_brand_id_key" ON "redemption_config"("brand_id");
CREATE INDEX IF NOT EXISTS "redemption_config_brand_id_idx" ON "redemption_config"("brand_id");

-- Tenant isolation, matching the standard brand-scoped policy in rls.sql.
ALTER TABLE "redemption_config" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "redemption_config" FOR ALL TO loyalty_app
    USING (
      brand_id = nullif(current_setting('app.current_brand_id', true), '')
      OR group_id = nullif(current_setting('app.current_group_id', true), '')
      OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
    )
    WITH CHECK (
      brand_id = nullif(current_setting('app.current_brand_id', true), '')
      OR group_id = nullif(current_setting('app.current_group_id', true), '')
      OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
