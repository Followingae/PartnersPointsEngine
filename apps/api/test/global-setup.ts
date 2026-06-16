/**
 * Boots an ephemeral embedded Postgres for API integration tests (or uses CI's
 * DATABASE_URL), applying the db package's baseline + RLS + ledger SQL.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import type { GlobalSetupContext } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    DATABASE_URL: string;
  }
}

let pg: EmbeddedPostgres | undefined;

async function applySql(url: string): Promise<void> {
  const sqlDir = join(process.cwd(), '..', '..', 'packages', 'db', 'prisma', 'sql');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const f of ['0001_baseline.sql', 'rls.sql', 'ledger.sql']) {
      await client.query(readFileSync(join(sqlDir, f), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

export default async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
  if (process.env.DATABASE_URL) {
    provide('DATABASE_URL', process.env.DATABASE_URL);
    return async () => {};
  }
  const dir = mkdtempSync(join(tmpdir(), 'rfm-api-pg-'));
  const port = 54330;
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });
  try {
    await pg.initialise();
    await pg.start();
    const url = `postgresql://postgres:postgres@localhost:${port}/postgres`;
    await applySql(url);
    provide('DATABASE_URL', url);
  } catch (err) {
    if (pg) await pg.stop().catch(() => {});
    pg = undefined;
    throw err;
  }
  return async () => {
    if (pg) await pg.stop();
  };
}
