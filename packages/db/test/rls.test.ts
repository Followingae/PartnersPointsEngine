/**
 * Cross-tenant Row-Level Security isolation suite — the proof that loyalty data
 * is closed-loop per brand. Connects as the migrator/owner to seed fixtures, then
 * exercises the enforced `loyalty_app` role via `SET LOCAL ROLE` + `SET LOCAL
 * app.current_*`, asserting that a brand principal can NEVER reach another brand
 * and that an unset context fails closed.
 *
 * Requires DATABASE_URL pointing at a Postgres where baseline + rls.sql are applied
 * (CI runs `pnpm --filter @rfm-loyalty/db db:apply` first). Skips if DATABASE_URL
 * is unset so unit runs without a DB don't fail.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbUrl } from './db-url';

describe('RLS cross-tenant isolation', () => {
  let client: Client;

  const platformId = randomUUID();
  const groupAId = randomUUID();
  const groupBId = randomUUID();
  const brandAId = randomUUID();
  const brandBId = randomUUID();
  const personId = randomUUID();
  const memAId = randomUUID();

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl() });
    await client.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO platform (id,name,region,status,created_at,updated_at)
       VALUES ($1,'RLS Test','uae','active',now(),now())`,
      [platformId],
    );
    for (const [gid, name] of [
      [groupAId, 'Group A'],
      [groupBId, 'Group B'],
    ] as const) {
      await client.query(
        `INSERT INTO tenant_group (id,platform_id,name,home_region,default_currency,status,created_at,updated_at)
         VALUES ($1,$2,$3,'uae','AED','active',now(),now())`,
        [gid, platformId, name],
      );
    }
    await client.query(
      `INSERT INTO brand (id,group_id,platform_id,name,slug,points_currency_code,currency,branding,status,created_at,updated_at)
       VALUES ($1,$2,$3,'Brand A','brand-a','PTS','AED','{}','active',now(),now())`,
      [brandAId, groupAId, platformId],
    );
    await client.query(
      `INSERT INTO brand (id,group_id,platform_id,name,slug,points_currency_code,currency,branding,status,created_at,updated_at)
       VALUES ($1,$2,$3,'Brand B','brand-b','PTS','AED','{}','active',now(),now())`,
      [brandBId, groupBId, platformId],
    );
    await client.query(
      `INSERT INTO person (id,platform_id,status,created_at,updated_at)
       VALUES ($1,$2,'active',now(),now())`,
      [personId, platformId],
    );
    await client.query(
      `INSERT INTO customer_membership (id,person_id,brand_id,group_id,platform_id,loyalty_id,status,joined_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,'A-0001','active',now(),now(),now())`,
      [memAId, personId, brandAId, groupAId, platformId],
    );
    await client.query('COMMIT');
  });

  afterAll(async () => {
    // Clean up fixtures (as owner — RLS does not apply to the owner).
    await client.query('DELETE FROM customer_membership WHERE platform_id = $1', [platformId]);
    await client.query('DELETE FROM person WHERE platform_id = $1', [platformId]);
    await client.query('DELETE FROM brand WHERE platform_id = $1', [platformId]);
    await client.query('DELETE FROM tenant_group WHERE platform_id = $1', [platformId]);
    await client.query('DELETE FROM platform WHERE id = $1', [platformId]);
    await client.end();
  });

  /** Run a query as the enforced loyalty_app role with a given tenant GUC. */
  async function asTenant<T = unknown>(
    settings: Record<string, string>,
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE loyalty_app');
      for (const [k, v] of Object.entries(settings)) {
        await client.query('SELECT set_config($1, $2, true)', [k, v]);
      }
      const res = await client.query(sql, params);
      return res as { rows: T[] };
    } finally {
      await client.query('ROLLBACK');
    }
  }

  it('fails closed: no tenant context returns zero rows', async () => {
    const { rows } = await asTenant<{ count: string }>({}, 'SELECT count(*)::int AS count FROM brand');
    expect(rows[0]?.count).toBe(0);
  });

  it('a brand principal sees ONLY its own brand', async () => {
    const { rows } = await asTenant<{ id: string }>(
      { 'app.current_brand_id': brandAId },
      'SELECT id FROM brand',
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(brandAId);
    expect(ids).not.toContain(brandBId);
    expect(ids).toHaveLength(1);
  });

  it("a brand principal cannot read another brand's memberships", async () => {
    const { rows } = await asTenant<{ count: string }>(
      { 'app.current_brand_id': brandBId },
      'SELECT count(*)::int AS count FROM customer_membership WHERE brand_id = $1',
      [brandAId],
    );
    expect(rows[0]?.count).toBe(0);
  });

  it('a group principal sees its brands but not another group', async () => {
    const { rows } = await asTenant<{ id: string }>(
      { 'app.current_group_id': groupAId },
      'SELECT id FROM brand',
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(brandAId);
    expect(ids).not.toContain(brandBId);
  });

  it('a platform principal sees all brands', async () => {
    const { rows } = await asTenant<{ id: string }>(
      { 'app.current_platform_id': platformId },
      'SELECT id FROM brand WHERE platform_id = $1',
      [platformId],
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(brandAId);
    expect(ids).toContain(brandBId);
  });

  it('WITH CHECK blocks writing a row tagged for another brand', async () => {
    await expect(
      asTenant(
        { 'app.current_brand_id': brandAId },
        `INSERT INTO customer_membership (id,person_id,brand_id,group_id,platform_id,loyalty_id,status,joined_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,'X-0002','active',now(),now(),now())`,
        [randomUUID(), personId, brandBId, groupBId, platformId],
      ),
    ).rejects.toThrow();
  });
});
