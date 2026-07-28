-- ─────────────────────────────────────────────────────────────────────────────
-- Stamp cards: repeatable challenges that issue a reward voucher each fill.
-- Additive only — existing challenges keep their behaviour (repeatable = false).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "challenge" ADD COLUMN IF NOT EXISTS "repeatable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "challenge" ADD COLUMN IF NOT EXISTS "reward_item_id" TEXT;
ALTER TABLE "challenge_progress" ADD COLUMN IF NOT EXISTS "completions" INTEGER NOT NULL DEFAULT 0;
