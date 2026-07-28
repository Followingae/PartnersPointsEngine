-- ─────────────────────────────────────────────────────────────────────────────
-- Platform-control migration: RFM operates the programs, brands propose.
--  1. New brands default to maker-checker (approval_required).
--  2. Existing autonomous brands are flipped: every governed brand-console
--     mutation (earn rules, tiers, rewards, campaigns, coupons, …) now queues
--     as a change request for superadmin approval (existing approvals UI).
-- Additive/behavioural only — no data destroyed; superadmin can relax any
-- brand back via PATCH /v1/admin/brands/:id/governance.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "brand" ALTER COLUMN "governance_mode" SET DEFAULT 'approval_required';

UPDATE "brand" SET "governance_mode" = 'approval_required' WHERE "governance_mode" = 'autonomous';
