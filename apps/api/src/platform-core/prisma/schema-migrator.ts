import { INCREMENTAL_MIGRATIONS } from '@rfm-loyalty/db';
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
 * · Only `INCREMENTAL_MIGRATIONS` runs — the same list `db:apply` and the test
 *   harness use, so the three cannot drift. The baseline, RLS and ledger
 *   scripts are not on it and never will be.
 * · Every file on it is idempotent, and `schema-migrator.e2e.test.ts` runs the
 *   whole list twice to keep that true — so the ledger below is an optimisation
 *   and a record, not the thing standing between us and a double-apply.
 * · A file already in the ledger is skipped, so editing one after it has been
 *   applied does not re-run it. Corrections go in a new file.
 * · One transaction per file. A file that fails leaves nothing half-applied and
 *   is retried on the next boot.
 * · A failure stops the boot. An API serving traffic against a schema it does
 *   not match is worse than an API that is briefly down: the first corrupts
 *   data quietly, the second pages somebody.
 */
const AUTO_APPLY = INCREMENTAL_MIGRATIONS;

/**
 * Arbitrary but fixed — every instance must pick the same number for the lock
 * to mean anything. Advisory locks share one namespace per database, so this
 * is deliberately not a round number that something else might also choose.
 */
const MIGRATION_LOCK = 4_820_117;

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
 * TLS for the migration connection, matching what the URL actually asks for.
 *
 * node-postgres treats `sslmode=require` as `verify-full` — stricter than
 * libpq, and stricter than Prisma, which connects to this same database over
 * this same URL without complaint. Against Supabase, whose chain is not in the
 * default trust store, that means `SELF_SIGNED_CERT_IN_CHAIN`: the migrator
 * threw, the boot died, and the platform rolled the deploy back.
 *
 * So the modes are honoured as libpq defines them. `require` and `prefer` mean
 * encrypt the connection — they have never meant verify the chain. `verify-ca`
 * and `verify-full` do, and are passed through untouched, so anyone who asks
 * for real verification still gets it.
 */
export function sslFor(url: string): { rejectUnauthorized: boolean } | boolean | undefined {
  let mode: string | null = null;
  try {
    mode = new URL(url).searchParams.get('sslmode');
  } catch {
    return undefined;
  }
  if (!mode || mode === 'disable') return undefined;
  if (mode === 'verify-full' || mode === 'verify-ca') return true;
  return { rejectUnauthorized: false };
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
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  const applied: string[] = [];
  let skipped = 0;

  try {
    // The API runs two instances, so two containers boot at once and would
    // otherwise migrate concurrently. The SQL is idempotent and each file is
    // its own transaction, so the damage would be limited — but two sessions
    // running the same `DROP FUNCTION … CREATE FUNCTION` do genuinely collide.
    // This makes them take turns; the second finds the ledger already filled
    // and applies nothing.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
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
    // Releasing explicitly is tidiness; ending the connection would drop it
    // anyway, including when the process dies mid-migration.
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    await client.end();
  }

  return { applied, skipped };
}
