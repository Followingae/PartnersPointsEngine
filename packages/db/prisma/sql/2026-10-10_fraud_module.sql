-- Fraud-protection module.
--
-- Two tables. `fraud_rule` holds per-brand thresholds (platform defaults live in
-- code and are used when a brand has no row). `fraud_alert` is an append-style
-- record of detections, deduped per (brand, rule, subject, window) so the same
-- pattern in the same window raises exactly one alert that staff acknowledge.
--
-- Both carry brand_id/group_id/platform_id and get the standard tenant_isolation
-- RLS policy, so a brand admin sees only their brand's alerts and a superadmin
-- (platform principal) sees everything — the same model as every other tenant
-- table. text + CHECK rather than new enum types, to stay transaction-safe and
-- re-runnable.
-- Idempotent throughout.

-- ── fraud_rule ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fraud_rule (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  platform_id     TEXT NOT NULL,
  group_id        TEXT NOT NULL,
  brand_id        TEXT NOT NULL,
  rule_key        TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  threshold_num   BIGINT NOT NULL,
  window_seconds  INTEGER NOT NULL DEFAULT 86400,
  severity        TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  action          TEXT NOT NULL DEFAULT 'alert'  CHECK (action IN ('alert','flag','block')),
  updated_by      TEXT,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fraud_rule_brand_key
  ON public.fraud_rule (brand_id, rule_key);
CREATE INDEX IF NOT EXISTS ix_fraud_rule_brand ON public.fraud_rule (brand_id);
CREATE INDEX IF NOT EXISTS ix_fraud_rule_group ON public.fraud_rule (group_id);
CREATE INDEX IF NOT EXISTS ix_fraud_rule_platform ON public.fraud_rule (platform_id);

-- ── fraud_alert ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fraud_alert (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  platform_id      TEXT NOT NULL,
  group_id         TEXT NOT NULL,
  brand_id         TEXT NOT NULL,
  rule_key         TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  subject_type     TEXT NOT NULL CHECK (subject_type IN ('membership','terminal','person','branch')),
  subject_id       TEXT NOT NULL,
  membership_id    TEXT,
  terminal_id      TEXT,
  branch_id        TEXT,
  window_start     TIMESTAMP(3) NOT NULL,
  window_end       TIMESTAMP(3) NOT NULL,
  metric_value     BIGINT NOT NULL,
  threshold_value  BIGINT NOT NULL,
  detail           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  acknowledged_by  TEXT,
  acknowledged_at  TIMESTAMP(3),
  resolved_by      TEXT,
  resolved_at      TIMESTAMP(3),
  created_at       TIMESTAMP(3) NOT NULL DEFAULT now()
);
-- One alert per (brand, rule, subject, window): re-evaluation of the same
-- window is idempotent (ON CONFLICT DO NOTHING in the evaluator).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fraud_alert_dedupe
  ON public.fraud_alert (brand_id, rule_key, subject_id, window_start);
CREATE INDEX IF NOT EXISTS ix_fraud_alert_brand_status ON public.fraud_alert (brand_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_fraud_alert_group ON public.fraud_alert (group_id);
CREATE INDEX IF NOT EXISTS ix_fraud_alert_platform_status ON public.fraud_alert (platform_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_fraud_alert_subject ON public.fraud_alert (brand_id, subject_id);

-- ── RLS (standard tenant_isolation, same shape as rls.sql) ───────────────────
DO $$
DECLARE
  t text;
  expr text := $expr$
    brand_id = nullif(current_setting('app.current_brand_id', true), '')
    OR group_id = nullif(current_setting('app.current_group_id', true), '')
    OR platform_id = nullif(current_setting('app.current_platform_id', true), '')
  $expr$;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loyalty_app') THEN
    FOREACH t IN ARRAY ARRAY['fraud_rule','fraud_alert'] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO loyalty_app USING (%s) WITH CHECK (%s)',
        t, expr, expr
      );
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO loyalty_app', t);
    END LOOP;
  END IF;
END $$;
