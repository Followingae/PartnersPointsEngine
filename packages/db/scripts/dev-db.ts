/**
 * Local dev database: a PERSISTENT embedded Postgres (no Docker/Supabase needed).
 * On a fresh data dir it applies the schema + RLS + ledger SQL and runs the seed;
 * on subsequent boots it just serves. Keeps running until Ctrl-C.
 *
 *   pnpm db:dev        # terminal 1 — boots + (first time) sets up + seeds, then serves
 *   (delete packages/db/.dev-pgdata to reset)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { INCREMENTAL_MIGRATIONS } from '../src/migrations';

const DATA_DIR = join(process.cwd(), '.dev-pgdata');
const PORT = 5432;
const URL = `postgresql://postgres:postgres@localhost:${PORT}/postgres`;

async function applySchema(files: readonly string[]): Promise<void> {
  const sqlDir = join(process.cwd(), 'prisma', 'sql');
  const client = new Client({ connectionString: URL });
  await client.connect();
  try {
    for (const f of files) {
      await client.query(readFileSync(join(sqlDir, f), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const freshCluster = !existsSync(join(DATA_DIR, 'PG_VERSION'));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });
  if (freshCluster) await pg.initialise();
  await pg.start();

  if (freshCluster) {
    console.log('Fresh cluster — applying schema + RLS + ledger…');
    await applySchema(['0001_baseline.sql', 'rls.sql', 'ledger.sql']);

    // The incremental list, which this script used to skip entirely — leaving a
    // brand-new dev database on the baseline schema and the seed failing on
    // columns and enum values that exist everywhere else. The API's boot
    // migrator would eventually apply them, but the seed runs first.
    //
    // Fresh clusters only. The list is ordered against the current baseline,
    // not against whatever a months-old `.dev-pgdata` happens to contain, so
    // replaying it over an aged cluster fails on the first file whose function
    // body references a column a later file adds. Reset the data dir instead.
    console.log('Applying incremental migrations…');
    await applySchema(INCREMENTAL_MIGRATIONS);

    console.log('Seeding demo data…');
    spawnSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL, NODE_ENV: 'development' },
      stdio: 'inherit',
      shell: true,
    });
  }

  console.log(`\n✅ Dev Postgres ready on ${URL}`);
  console.log('   Leave this running; start the apps with `pnpm dev` in another terminal.\n');

  const shutdown = async () => {
    console.log('\nStopping dev Postgres…');
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise<never>(() => {}); // keep alive
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
