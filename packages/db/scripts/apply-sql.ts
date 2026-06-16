/**
 * Applies the baseline DDL + RLS SQL to the target database. Intended for CI
 * (fresh Postgres) and local bootstrapping. For Supabase, prefer applying via
 * migrations; this script is a portable fallback that needs no psql/Docker.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DIRECT_URL or DATABASE_URL must be set');

  const sqlDir = join(__dirname, '..', 'prisma', 'sql');
  const baseline = readFileSync(join(sqlDir, '0001_baseline.sql'), 'utf8');
  const rls = readFileSync(join(sqlDir, 'rls.sql'), 'utf8');
  const ledger = readFileSync(join(sqlDir, 'ledger.sql'), 'utf8');

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(baseline);
    console.log('Applied baseline DDL.');
    await client.query(rls);
    console.log('Applied RLS policies.');
    await client.query(ledger);
    console.log('Applied ledger integrity (triggers + constraints).');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
