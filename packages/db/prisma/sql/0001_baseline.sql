-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "entity_status" AS ENUM ('active', 'inactive', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "scope_level" AS ENUM ('platform', 'group', 'brand', 'branch');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('user', 'customer', 'terminal', 'system');

-- CreateEnum
CREATE TYPE "customer_identifier_type" AS ENUM ('phone', 'email', 'qr', 'nfc', 'loyalty_id', 'card_token');

-- CreateEnum
CREATE TYPE "api_key_status" AS ENUM ('active', 'rotating', 'revoked');

-- CreateEnum
CREATE TYPE "governance_mode" AS ENUM ('autonomous', 'approval_required', 'superadmin_managed');

-- CreateEnum
CREATE TYPE "change_request_status" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "change_request_action" AS ENUM ('create', 'update', 'delete');

-- CreateEnum
CREATE TYPE "coupon_status" AS ENUM ('active', 'paused', 'expired', 'archived');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "ledger_name" AS ENUM ('points', 'wallet');

-- CreateEnum
CREATE TYPE "normal_side" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "entry_direction" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "journal_kind" AS ENUM ('earn', 'redeem_auth', 'redeem_capture', 'void', 'reverse', 'topup', 'drawdown', 'expiry', 'adjust', 'fee');

-- CreateEnum
CREATE TYPE "loyalty_channel" AS ENUM ('online', 'in_store');

-- CreateEnum
CREATE TYPE "point_state" AS ENUM ('pending', 'active', 'redeemed', 'expired', 'reversed', 'adjusted');

-- CreateEnum
CREATE TYPE "breakage_owner" AS ENUM ('merchant', 'platform', 'split');

-- CreateEnum
CREATE TYPE "voucher_status" AS ENUM ('issued', 'redeemed', 'expired', 'void');

-- CreateEnum
CREATE TYPE "terminal_intent" AS ENUM ('earn', 'redeem');

-- CreateEnum
CREATE TYPE "terminal_txn_state" AS ENUM ('pending', 'authorized', 'captured', 'voided', 'expired', 'reversed', 'failed');

-- CreateEnum
CREATE TYPE "referral_status" AS ENUM ('pending', 'qualified', 'rewarded');

-- CreateEnum
CREATE TYPE "webhook_delivery_status" AS ENUM ('pending', 'delivered', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "partner_connector_mode" AS ENUM ('stub', 'sandbox', 'live');

-- CreateEnum
CREATE TYPE "conversion_status" AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "topup_request_status" AS ENUM ('pending', 'invoiced', 'confirmed', 'rejected');

-- CreateTable
CREATE TABLE "platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'uae',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_group" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "home_region" TEXT NOT NULL DEFAULT 'uae',
    "default_currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "points_currency_code" TEXT NOT NULL DEFAULT 'PTS',
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "branding" JSONB NOT NULL DEFAULT '{}',
    "module_access" JSONB NOT NULL DEFAULT '{}',
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "governance_mode" "governance_mode" NOT NULL DEFAULT 'autonomous',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_lower" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "totp_secret_enc" BYTEA,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rbac_role" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rbac_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rbac_permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "rbac_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rbac_role_permission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "rbac_role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "scope_level" "scope_level" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT,
    "brand_id" TEXT,
    "branch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by" TEXT,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation_session" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "impersonation_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "publishable_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "secret_enc" BYTEA,
    "prev_secret_hash" TEXT,
    "rotated_at" TIMESTAMP(3),
    "status" "api_key_status" NOT NULL DEFAULT 'active',
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "terminal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "paired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "phone_hash" TEXT,
    "phone_enc" BYTEA,
    "email_hash" TEXT,
    "email_enc" BYTEA,
    "full_name" TEXT,
    "gender" TEXT,
    "birthdate" DATE,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_membership" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "loyalty_id" TEXT NOT NULL,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_identifier" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "type" "customer_identifier_type" NOT NULL,
    "value_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_identifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "aggregate" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "response" JSONB,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT,
    "brand_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT,
    "brand_id" TEXT,
    "branch_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "governance_context_id" TEXT,
    "prev_hash" TEXT,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_config" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "mode" "governance_mode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_request" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" "change_request_action" NOT NULL,
    "proposed_payload" JSONB NOT NULL,
    "current_snapshot" JSONB,
    "diff" JSONB NOT NULL DEFAULT '[]',
    "status" "change_request_status" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "requester_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "decision_reason" TEXT,
    "applied_entity_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "batch_id" TEXT,
    "campaign_name" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'discount',
    "value_minor" BIGINT NOT NULL DEFAULT 0,
    "percent_off" INTEGER,
    "max_redemptions" INTEGER NOT NULL DEFAULT 1,
    "per_customer_limit" INTEGER NOT NULL DEFAULT 1,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "status" "coupon_status" NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemption" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL DEFAULT '{}',
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "notification_channel" NOT NULL DEFAULT 'email',
    "event" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_account" (
    "id" TEXT NOT NULL,
    "ledger" "ledger_name" NOT NULL,
    "account_type" TEXT NOT NULL,
    "normal_side" "normal_side" NOT NULL,
    "asset_code" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal" (
    "id" TEXT NOT NULL,
    "ledger" "ledger_name" NOT NULL,
    "kind" "journal_kind" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverses_id" TEXT,
    "source_event" TEXT,
    "channel" "loyalty_channel",
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "branch_id" TEXT,
    "idempotency_key_id" TEXT,

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry" (
    "id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "direction" "entry_direction" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "point_state" "point_state",
    "expiry_bucket" DATE,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "brand_id" TEXT,

    CONSTRAINT "entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_balance" (
    "account_id" TEXT NOT NULL,
    "posted_debits" BIGINT NOT NULL DEFAULT 0,
    "posted_credits" BIGINT NOT NULL DEFAULT 0,
    "pending_debits" BIGINT NOT NULL DEFAULT 0,
    "pending_credits" BIGINT NOT NULL DEFAULT 0,
    "normal_side" "normal_side" NOT NULL,
    "lock_version" BIGINT NOT NULL DEFAULT 0,
    "platform_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_balance_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "group_wallet" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "low_balance_threshold" BIGINT NOT NULL DEFAULT 0,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_rule" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "issuance_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "cost_per_point_minor" BIGINT NOT NULL DEFAULT 0,
    "platform_margin_bps" INTEGER NOT NULL DEFAULT 0,
    "breakage_owner" "breakage_owner" NOT NULL DEFAULT 'merchant',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earn_rule" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "earn_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "threshold" BIGINT NOT NULL DEFAULT 0,
    "multiplier_bps" INTEGER NOT NULL DEFAULT 10000,
    "benefits" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_catalog_item" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "points_cost" BIGINT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'voucher',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_catalog_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "catalog_item_id" TEXT,
    "membership_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "voucher_status" NOT NULL DEFAULT 'issued',
    "points_spent" BIGINT NOT NULL,
    "redeem_journal_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemed_at" TIMESTAMP(3),

    CONSTRAINT "voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_transaction" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "terminal_id" TEXT,
    "membership_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "intent" "terminal_intent" NOT NULL,
    "state" "terminal_txn_state" NOT NULL DEFAULT 'pending',
    "amount_minor" BIGINT,
    "points" BIGINT,
    "currency" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "auth_journal_id" TEXT,
    "capture_journal_id" TEXT,
    "drawdown_journal_id" TEXT,
    "settled_at" TIMESTAMP(3),
    "source_event" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "reward_points" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_award" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "journal_id" TEXT,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'lifetime_points',
    "target" BIGINT NOT NULL,
    "reward_points" BIGINT NOT NULL DEFAULT 0,
    "badge_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_progress" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "progress" BIGINT NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "referrer_membership_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referee_membership_id" TEXT,
    "status" "referral_status" NOT NULL DEFAULT 'pending',
    "referrer_reward_points" BIGINT NOT NULL DEFAULT 0,
    "referee_reward_points" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualified_at" TIMESTAMP(3),

    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoint" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_enc" BYTEA NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_daily_metric" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "points_earned" BIGINT NOT NULL DEFAULT 0,
    "points_redeemed" BIGINT NOT NULL DEFAULT 0,
    "points_expired" BIGINT NOT NULL DEFAULT 0,
    "txn_count" INTEGER NOT NULL DEFAULT 0,
    "active_customers" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_daily_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfm_snapshot" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "as_of" DATE NOT NULL,
    "recency_days" INTEGER NOT NULL,
    "frequency" INTEGER NOT NULL,
    "monetary" BIGINT NOT NULL,
    "r_score" INTEGER NOT NULL,
    "f_score" INTEGER NOT NULL,
    "m_score" INTEGER NOT NULL,
    "segment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfm_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "webhook_delivery_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency_name" TEXT NOT NULL,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "connector_mode" "partner_connector_mode" NOT NULL DEFAULT 'stub',
    "connector_config_enc" BYTEA,
    "default_ratio_bps" INTEGER NOT NULL DEFAULT 10000,
    "cost_per_partner_point_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_merchant" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "ratio_bps" INTEGER NOT NULL DEFAULT 10000,
    "min_conversion" INTEGER NOT NULL DEFAULT 0,
    "max_conversion_per_day" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowance_wallet" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "balance_minor" BIGINT NOT NULL DEFAULT 0,
    "low_balance_threshold_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allowance_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowance_txn" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "direction" "entry_direction" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "conversion_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowance_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_customer_link" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "partner_member_ref" TEXT NOT NULL,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_customer_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "source_points" BIGINT NOT NULL,
    "partner_points" BIGINT NOT NULL,
    "ratio_bps" INTEGER NOT NULL,
    "allowance_cost_minor" BIGINT NOT NULL,
    "status" "conversion_status" NOT NULL DEFAULT 'pending',
    "partner_txn_ref" TEXT,
    "failure_reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowance_topup_request" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "topup_request_status" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "invoice_ref" TEXT,
    "review_note" TEXT,
    "requested_by_actor_id" TEXT NOT NULL,
    "reviewed_by_actor_id" TEXT,
    "allowance_txn_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "invoiced_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "allowance_topup_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_group_platform_id_idx" ON "tenant_group"("platform_id");

-- CreateIndex
CREATE INDEX "brand_group_id_idx" ON "brand"("group_id");

-- CreateIndex
CREATE INDEX "brand_platform_id_idx" ON "brand"("platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "brand_group_id_slug_key" ON "brand"("group_id", "slug");

-- CreateIndex
CREATE INDEX "branch_brand_id_idx" ON "branch"("brand_id");

-- CreateIndex
CREATE INDEX "branch_group_id_idx" ON "branch"("group_id");

-- CreateIndex
CREATE INDEX "user_account_platform_id_idx" ON "user_account"("platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_platform_id_email_lower_key" ON "user_account"("platform_id", "email_lower");

-- CreateIndex
CREATE UNIQUE INDEX "rbac_role_platform_id_key_key" ON "rbac_role"("platform_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "rbac_permission_key_key" ON "rbac_permission"("key");

-- CreateIndex
CREATE INDEX "role_assignment_user_id_idx" ON "role_assignment"("user_id");

-- CreateIndex
CREATE INDEX "role_assignment_platform_id_idx" ON "role_assignment"("platform_id");

-- CreateIndex
CREATE INDEX "role_assignment_group_id_idx" ON "role_assignment"("group_id");

-- CreateIndex
CREATE INDEX "role_assignment_brand_id_idx" ON "role_assignment"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignment_user_id_role_id_scope_level_scope_id_key" ON "role_assignment"("user_id", "role_id", "scope_level", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "refresh_token_platform_id_idx" ON "refresh_token"("platform_id");

-- CreateIndex
CREATE INDEX "impersonation_session_actor_user_id_idx" ON "impersonation_session"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_publishable_id_key" ON "api_key"("publishable_id");

-- CreateIndex
CREATE INDEX "api_key_brand_id_idx" ON "api_key"("brand_id");

-- CreateIndex
CREATE INDEX "api_key_group_id_idx" ON "api_key"("group_id");

-- CreateIndex
CREATE INDEX "terminal_branch_id_idx" ON "terminal"("branch_id");

-- CreateIndex
CREATE INDEX "terminal_brand_id_idx" ON "terminal"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_phone_hash_key" ON "person"("phone_hash");

-- CreateIndex
CREATE UNIQUE INDEX "person_email_hash_key" ON "person"("email_hash");

-- CreateIndex
CREATE INDEX "person_platform_id_idx" ON "person"("platform_id");

-- CreateIndex
CREATE INDEX "customer_membership_brand_id_idx" ON "customer_membership"("brand_id");

-- CreateIndex
CREATE INDEX "customer_membership_group_id_idx" ON "customer_membership"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_membership_person_id_brand_id_key" ON "customer_membership"("person_id", "brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_membership_brand_id_loyalty_id_key" ON "customer_membership"("brand_id", "loyalty_id");

-- CreateIndex
CREATE INDEX "customer_identifier_membership_id_idx" ON "customer_identifier"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identifier_brand_id_type_value_hash_key" ON "customer_identifier"("brand_id", "type", "value_hash");

-- CreateIndex
CREATE INDEX "outbox_published_at_idx" ON "outbox"("published_at");

-- CreateIndex
CREATE INDEX "outbox_brand_id_idx" ON "outbox"("brand_id");

-- CreateIndex
CREATE INDEX "idempotency_key_brand_id_idx" ON "idempotency_key"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_actor_id_key_key" ON "idempotency_key"("actor_id", "key");

-- CreateIndex
CREATE INDEX "audit_log_platform_id_idx" ON "audit_log"("platform_id");

-- CreateIndex
CREATE INDEX "audit_log_brand_id_idx" ON "audit_log"("brand_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "governance_config_brand_id_idx" ON "governance_config"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "governance_config_brand_id_entity_type_key" ON "governance_config"("brand_id", "entity_type");

-- CreateIndex
CREATE INDEX "change_request_brand_id_status_idx" ON "change_request"("brand_id", "status");

-- CreateIndex
CREATE INDEX "change_request_platform_id_status_idx" ON "change_request"("platform_id", "status");

-- CreateIndex
CREATE INDEX "change_request_requester_id_idx" ON "change_request"("requester_id");

-- CreateIndex
CREATE INDEX "coupon_brand_id_batch_id_idx" ON "coupon"("brand_id", "batch_id");

-- CreateIndex
CREATE INDEX "coupon_brand_id_status_idx" ON "coupon"("brand_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_brand_id_code_key" ON "coupon"("brand_id", "code");

-- CreateIndex
CREATE INDEX "coupon_redemption_coupon_id_idx" ON "coupon_redemption"("coupon_id");

-- CreateIndex
CREATE INDEX "coupon_redemption_brand_id_membership_id_idx" ON "coupon_redemption"("brand_id", "membership_id");

-- CreateIndex
CREATE INDEX "segment_brand_id_idx" ON "segment"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "segment_brand_id_name_key" ON "segment"("brand_id", "name");

-- CreateIndex
CREATE INDEX "notification_template_brand_id_idx" ON "notification_template"("brand_id");

-- CreateIndex
CREATE INDEX "ledger_account_brand_id_idx" ON "ledger_account"("brand_id");

-- CreateIndex
CREATE INDEX "ledger_account_group_id_idx" ON "ledger_account"("group_id");

-- CreateIndex
CREATE INDEX "ledger_account_ledger_account_type_idx" ON "ledger_account"("ledger", "account_type");

-- CreateIndex
CREATE INDEX "journal_brand_id_idx" ON "journal"("brand_id");

-- CreateIndex
CREATE INDEX "journal_brand_id_channel_idx" ON "journal"("brand_id", "channel");

-- CreateIndex
CREATE INDEX "journal_group_id_idx" ON "journal"("group_id");

-- CreateIndex
CREATE INDEX "journal_source_event_idx" ON "journal"("source_event");

-- CreateIndex
CREATE INDEX "entry_account_id_idx" ON "entry"("account_id");

-- CreateIndex
CREATE INDEX "entry_journal_id_idx" ON "entry"("journal_id");

-- CreateIndex
CREATE INDEX "entry_brand_id_idx" ON "entry"("brand_id");

-- CreateIndex
CREATE INDEX "account_balance_brand_id_idx" ON "account_balance"("brand_id");

-- CreateIndex
CREATE INDEX "account_balance_group_id_idx" ON "account_balance"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_wallet_group_id_key" ON "group_wallet"("group_id");

-- CreateIndex
CREATE INDEX "group_wallet_platform_id_idx" ON "group_wallet"("platform_id");

-- CreateIndex
CREATE INDEX "cost_rule_group_id_effective_from_idx" ON "cost_rule"("group_id", "effective_from");

-- CreateIndex
CREATE INDEX "earn_rule_brand_id_priority_idx" ON "earn_rule"("brand_id", "priority");

-- CreateIndex
CREATE INDEX "tier_brand_id_threshold_idx" ON "tier"("brand_id", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "tier_brand_id_name_key" ON "tier"("brand_id", "name");

-- CreateIndex
CREATE INDEX "reward_catalog_item_brand_id_idx" ON "reward_catalog_item"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_code_key" ON "voucher"("code");

-- CreateIndex
CREATE INDEX "voucher_brand_id_idx" ON "voucher"("brand_id");

-- CreateIndex
CREATE INDEX "voucher_membership_id_idx" ON "voucher"("membership_id");

-- CreateIndex
CREATE INDEX "terminal_transaction_brand_id_idx" ON "terminal_transaction"("brand_id");

-- CreateIndex
CREATE INDEX "terminal_transaction_membership_id_idx" ON "terminal_transaction"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_transaction_actor_id_idempotency_key_key" ON "terminal_transaction"("actor_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "campaign_brand_id_enabled_idx" ON "campaign"("brand_id", "enabled");

-- CreateIndex
CREATE INDEX "badge_brand_id_idx" ON "badge"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "badge_brand_id_name_key" ON "badge"("brand_id", "name");

-- CreateIndex
CREATE INDEX "badge_award_brand_id_idx" ON "badge_award"("brand_id");

-- CreateIndex
CREATE INDEX "badge_award_membership_id_idx" ON "badge_award"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "badge_award_badge_id_membership_id_key" ON "badge_award"("badge_id", "membership_id");

-- CreateIndex
CREATE INDEX "challenge_brand_id_enabled_idx" ON "challenge"("brand_id", "enabled");

-- CreateIndex
CREATE INDEX "challenge_progress_brand_id_idx" ON "challenge_progress"("brand_id");

-- CreateIndex
CREATE INDEX "challenge_progress_membership_id_idx" ON "challenge_progress"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_progress_challenge_id_membership_id_key" ON "challenge_progress"("challenge_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_code_key" ON "referral"("code");

-- CreateIndex
CREATE INDEX "referral_brand_id_idx" ON "referral"("brand_id");

-- CreateIndex
CREATE INDEX "referral_referrer_membership_id_idx" ON "referral"("referrer_membership_id");

-- CreateIndex
CREATE INDEX "webhook_endpoint_brand_id_idx" ON "webhook_endpoint"("brand_id");

-- CreateIndex
CREATE INDEX "brand_daily_metric_brand_id_date_idx" ON "brand_daily_metric"("brand_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "brand_daily_metric_brand_id_date_key" ON "brand_daily_metric"("brand_id", "date");

-- CreateIndex
CREATE INDEX "rfm_snapshot_brand_id_as_of_idx" ON "rfm_snapshot"("brand_id", "as_of");

-- CreateIndex
CREATE INDEX "rfm_snapshot_brand_id_segment_idx" ON "rfm_snapshot"("brand_id", "segment");

-- CreateIndex
CREATE UNIQUE INDEX "rfm_snapshot_brand_id_membership_id_as_of_key" ON "rfm_snapshot"("brand_id", "membership_id", "as_of");

-- CreateIndex
CREATE INDEX "webhook_delivery_brand_id_idx" ON "webhook_delivery"("brand_id");

-- CreateIndex
CREATE INDEX "webhook_delivery_status_idx" ON "webhook_delivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_platform_id_key_key" ON "partner"("platform_id", "key");

-- CreateIndex
CREATE INDEX "partner_merchant_brand_id_idx" ON "partner_merchant"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_merchant_partner_id_brand_id_key" ON "partner_merchant"("partner_id", "brand_id");

-- CreateIndex
CREATE INDEX "allowance_wallet_brand_id_idx" ON "allowance_wallet"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "allowance_wallet_partner_id_brand_id_key" ON "allowance_wallet"("partner_id", "brand_id");

-- CreateIndex
CREATE INDEX "allowance_txn_wallet_id_idx" ON "allowance_txn"("wallet_id");

-- CreateIndex
CREATE INDEX "allowance_txn_brand_id_idx" ON "allowance_txn"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_customer_link_partner_id_person_id_key" ON "partner_customer_link"("partner_id", "person_id");

-- CreateIndex
CREATE INDEX "conversion_brand_id_created_at_idx" ON "conversion"("brand_id", "created_at");

-- CreateIndex
CREATE INDEX "conversion_partner_id_created_at_idx" ON "conversion"("partner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_brand_id_idempotency_key_key" ON "conversion"("brand_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "allowance_topup_request_brand_id_created_at_idx" ON "allowance_topup_request"("brand_id", "created_at");

-- CreateIndex
CREATE INDEX "allowance_topup_request_partner_id_status_idx" ON "allowance_topup_request"("partner_id", "status");

-- AddForeignKey
ALTER TABLE "tenant_group" ADD CONSTRAINT "tenant_group_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand" ADD CONSTRAINT "brand_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "tenant_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rbac_role_permission" ADD CONSTRAINT "rbac_role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "rbac_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rbac_role_permission" ADD CONSTRAINT "rbac_role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "rbac_permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "rbac_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_session" ADD CONSTRAINT "impersonation_session_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal" ADD CONSTRAINT "terminal_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_membership" ADD CONSTRAINT "customer_membership_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_identifier" ADD CONSTRAINT "customer_identifier_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "customer_membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemption" ADD CONSTRAINT "coupon_redemption_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_idempotency_key_id_fkey" FOREIGN KEY ("idempotency_key_id") REFERENCES "idempotency_key"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balance" ADD CONSTRAINT "account_balance_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher" ADD CONSTRAINT "voucher_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "reward_catalog_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_award" ADD CONSTRAINT "badge_award_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_progress" ADD CONSTRAINT "challenge_progress_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_merchant" ADD CONSTRAINT "partner_merchant_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

