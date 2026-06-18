-- ─────────────────────────────────────────────────────────────────────────────
-- Additive migration: AllowanceTopupRequest (merchant-initiated prepaid top-ups)
-- Safe to run against prod: only CREATEs, no destructive changes.
-- Apply order: this script → then re-run rls.sql is NOT required (policy below is
-- self-contained), but rls.sql already lists allowance_topup_request so a future
-- full re-apply stays consistent.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "topup_request_status" AS ENUM ('pending', 'invoiced', 'confirmed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "allowance_topup_request" (
  "id"                    TEXT NOT NULL,
  "partner_id"            TEXT NOT NULL,
  "wallet_id"             TEXT NOT NULL,
  "brand_id"              TEXT NOT NULL,
  "group_id"              TEXT NOT NULL,
  "platform_id"           TEXT NOT NULL,
  "amount_minor"          BIGINT NOT NULL,
  "currency"              TEXT NOT NULL DEFAULT 'AED',
  "status"                "topup_request_status" NOT NULL DEFAULT 'pending',
  "note"                  TEXT,
  "invoice_ref"           TEXT,
  "review_note"           TEXT,
  "requested_by_actor_id" TEXT NOT NULL,
  "reviewed_by_actor_id"  TEXT,
  "allowance_txn_id"      TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invoiced_at"           TIMESTAMP(3),
  "confirmed_at"          TIMESTAMP(3),
  CONSTRAINT "allowance_topup_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "allowance_topup_request_brand_id_created_at_idx"
  ON "allowance_topup_request" ("brand_id", "created_at");
CREATE INDEX IF NOT EXISTS "allowance_topup_request_partner_id_status_idx"
  ON "allowance_topup_request" ("partner_id", "status");

-- RLS: standard brand-hierarchy tenant isolation (own brand / group / platform).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "allowance_topup_request" TO loyalty_app;
ALTER TABLE public.allowance_topup_request ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.allowance_topup_request;
CREATE POLICY tenant_isolation ON public.allowance_topup_request FOR ALL TO loyalty_app
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
