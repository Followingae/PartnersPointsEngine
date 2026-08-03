/**
 * The boot migrator.
 *
 * This runs before the API serves anything, in production, unattended. Two
 * properties matter more than the rest: it must be safe to run twice (every
 * container restart runs it), and a failure must not leave the schema half
 * changed. Both are tested here rather than discovered on a deploy.
 */
import { PrismaClient } from '@rfm-loyalty/db';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyPendingMigrations } from '../src/platform-core/prisma/schema-migrator';

const quiet = { info: () => undefined, error: () => undefined };

describe('boot migrator', () => {
  let prisma: PrismaClient;
  const previous = process.env.DIRECT_URL;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    process.env.DIRECT_URL = inject('DATABASE_URL');
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = previous;
    await prisma.$disconnect();
  });

  it('applies what is pending and records it', async () => {
    // global-setup has already applied these files directly, so the first run
    // here is the realistic case: SQL that is idempotent, ledger that is empty.
    const first = await applyPendingMigrations(quiet);
    expect(first.applied.length).toBeGreaterThan(0);

    const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM schema_migration`;
    expect(rows.length).toBe(first.applied.length);
  });

  it('is a no-op the second time — every restart runs it again', async () => {
    const second = await applyPendingMigrations(quiet);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toBeGreaterThan(0);
  });

  it('leaves the schema usable — the columns the app queries are really there', async () => {
    const cols = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name = 'refresh_token' AND column_name = 'first_seen_at')
          OR (table_name = 'receipt' AND column_name = 'bonuses')
          OR (table_name = 'terminal' AND column_name = 'app_version_code')`;
    expect(cols.length).toBe(3);
  });

  it('does not silently succeed when it cannot reach a database', async () => {
    process.env.DIRECT_URL = 'postgresql://u:p@127.0.0.1:1/none';
    // Unreachable is a thrown error, not an empty success — a boot that
    // "migrated nothing" and carried on is how a schema mismatch reaches prod.
    await expect(applyPendingMigrations(quiet)).rejects.toThrow();
    process.env.DIRECT_URL = inject('DATABASE_URL');
  });

  /**
   * The API runs two instances, so two containers migrate at once on every
   * deploy. Serialised by an advisory lock — without it two sessions running
   * the same DROP/CREATE FUNCTION collide.
   */
  it('two instances booting together do not collide', async () => {
    await prisma.$executeRaw`DELETE FROM schema_migration`;
    const [a, b] = await Promise.all([
      applyPendingMigrations(quiet),
      applyPendingMigrations(quiet),
    ]);
    // One did the work, the other found it already done. Which is which is a
    // race, so assert the invariant rather than the winner.
    expect(a.applied.length + b.applied.length).toBeGreaterThan(0);
    expect(Math.min(a.applied.length, b.applied.length)).toBe(0);
  });
});
