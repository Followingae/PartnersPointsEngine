/**
 * Every schema change since the baseline, in the order it must be applied.
 *
 * One list, because there were three and they drifted. The API applies these at
 * boot, `db:apply` applies them after the baseline for a fresh database, and the
 * API's test setup applies them to its throwaway Postgres — and CI's database
 * was getting only the baseline, so tests failed on columns that exist
 * everywhere except the one place that was supposed to catch it.
 *
 * The baseline, RLS and ledger scripts are deliberately absent. Those create
 * the world; re-running them against a live database is a different and far
 * more dangerous operation than adding a column, and it stays a decision
 * somebody makes on purpose.
 *
 * Every file here must be safe to run twice — `IF NOT EXISTS`,
 * `CREATE OR REPLACE`, and a `DROP … IF EXISTS` naming the *exact* signature
 * being created. `schema-migrator.e2e.test.ts` runs the whole list twice and is
 * what keeps that true.
 */
export const INCREMENTAL_MIGRATIONS = [
  '2026-06-18_allowance_topup_request.sql',
  '2026-07-28_customer_wallet.sql',
  '2026-07-28_otp_code.sql',
  '2026-07-28_wallet_scan_code.sql',
  '2026-07-28_customer_refresh_tokens.sql',
  '2026-07-28_wallet_join_brand.sql',
  '2026-07-28_stamp_cards.sql',
  '2026-07-28_redemption_config.sql',
  '2026-07-28_ereceipt_brand.sql',
  '2026-07-28_person_access_and_receipts.sql',
  '2026-07-28_superadmin_control.sql',
  '2026-08-03_profile_and_alerts.sql',
  '2026-08-03_claim_txn_alerts.sql',
  '2026-08-03_txn_alert_context.sql',
  '2026-08-03_pii_backfill.sql',
  '2026-08-03_claim_alerts_settled.sql',
  '2026-08-03_wallet_sessions.sql',
  '2026-08-03_receipt_bonuses.sql',
  '2026-08-03_terminal_releases.sql',
  '2026-08-04_receipt_celebrations.sql',
  '2026-08-04_home_branch.sql',
  '2026-08-04_wallet_set_email.sql',
  '2026-08-04_push_tokens.sql',
  '2026-08-04_wallet_offers.sql',
] as const;
