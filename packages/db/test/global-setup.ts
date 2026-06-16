/**
 * Vitest global setup. If DATABASE_URL is set (CI), assumes the schema was already
 * applied by `db:apply` and just shares the URL. Otherwise boots an ephemeral
 * embedded Postgres locally (no Docker), applies baseline + RLS + ledger SQL, and
 * shares the connection string via `provide`. Tears the instance down afterwards.
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
  const sqlDir = join(process.cwd(), 'prisma', 'sql');
  const files = ['0001_baseline.sql', 'rls.sql', 'ledger.sql'];
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const f of files) {
      await client.query(readFileSync(join(sqlDir, f), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

export default async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
  const existing = process.env.DATABASE_URL;
  if (existing) {
    provide('DATABASE_URL', existing);
    return async () => {};
  }

  const dir = mkdtempSync(join(tmpdir(), 'rfm-pg-test-'));
  const port = 54329;
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    // Force UTF-8 (the OS locale would otherwise default the cluster to WIN1252);
    // production Postgres / Supabase is UTF-8.
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
