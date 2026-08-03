import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Applies pending schema changes before the API serves its first request.
 *
 * The deploy had no migration step. The container built the image and ran
 * `node dist/main.js`, which meant every schema change was a manual SQL run
 * that somebody had to remember to do *first* — and forgetting meant new code
 * querying a column that wasn't there, on every request, in production. That is
 * a fragile way to ship, and it is the reason this exists.
 *
 * Deliberately narrow:
 *
 * · Only the files named below run. The baseline, RLS and ledger scripts are
 *   not in the list and never will be — re-running those against a live
 *   database is a different and far more dangerous operation than adding a
 *   column, and it should stay a decision somebody makes on purpose.
 * · Every file here is written to be idempotent (`IF NOT EXISTS`,
 *   `CREATE OR REPLACE`, and a `DROP … IF EXISTS` for the exact signature being
 *   created), so the ledger below is an optimisation and a record, not the
 *   thing standing between us and a double-apply. `schema-migrator.e2e.test.ts`
 *   runs the whole list twice and is what keeps that true.
 * · A file already in the ledger is skipped, so editing one after it has been
 *   applied does not re-run it. Corrections go in a new file.
 * · One transaction per file. A file that fails leaves nothing half-applied and
 *   is retried on the next boot.
 * · A failure stops the boot. An API serving traffic against a schema it does
 *   not match is worse than an API that is briefly down: the first corrupts
 *   data quietly, the second pages somebody.
 */
const AUTO_APPLY = [
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
] as const;

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migration (
    name        TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

/** Where the SQL lives, in the image and in the repo. */
function sqlDir(): string {
  // The Dockerfile deploys the API with its workspace dependencies, so the db
  // package sits alongside; in the repo it is two levels up.
  const candidates = [
    // Where the Dockerfile puts them, checked first so the image never depends
    // on how pnpm chose to lay out the workspace that day.
    join(process.cwd(), 'prisma', 'sql'),
    join(process.cwd(), 'node_modules', '@rfm-loyalty', 'db', 'prisma', 'sql'),
    join(process.cwd(), '..', '..', 'packages', 'db', 'prisma', 'sql'),
    join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'prisma', 'sql'),
  ];
  for (const dir of candidates) {
    try {
      readFileSync(join(dir, AUTO_APPLY[0]!), 'utf8');
      return dir;
    } catch {
      /* try the next one */
    }
  }
  throw new Error('schema SQL directory not found');
}

export interface MigrateResult {
  applied: string[];
  skipped: number;
}

/**
 * Runs pending migrations as the owner role.
 *
 * `DIRECT_URL` rather than the pooled URL: DDL through a transaction pooler is
 * unreliable, and `APP_DATABASE_URL` is the RLS-enforced role that deliberately
 * cannot alter tables.
 */
export async function applyPendingMigrations(log: {
  info: (m: string) => void;
  error: (m: string) => void;
}): Promise<MigrateResult> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    log.error('No DIRECT_URL/DATABASE_URL — skipping schema migration.');
    return { applied: [], skipped: AUTO_APPLY.length };
  }

  const dir = sqlDir();
  const client = new Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];
  let skipped = 0;

  try {
    await client.query(LEDGER);
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migration')).rows.map(
        (r) => r.name,
      ),
    );

    for (const name of AUTO_APPLY) {
      if (done.has(name)) {
        skipped++;
        continue;
      }
      const sql = readFileSync(join(dir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)
             ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum`,
          [name, checksum],
        );
        await client.query('COMMIT');
        applied.push(name);
        log.info(`schema: applied ${name}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`schema: ${name} failed — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await client.end();
  }

  return { applied, skipped };
}
