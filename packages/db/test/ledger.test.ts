/**
 * Ledger + wallet correctness suite (Phase 2). Runs against embedded Postgres
 * (or CI's DATABASE_URL) as the owner role, so it exercises the real DB triggers
 * and CHECK constraints. Tenancy/RLS is proven separately in rls.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authorizeRedeem,
  captureRedeem,
  drawdownWallet,
  earnPoints,
  getBalance,
  getOrCreateAccount,
  LedgerError,
  pointsAsset,
  postJournal,
  topUpWallet,
  voidRedeem,
  type Tx,
} from '../src/ledger';
import { dbUrl } from './db-url';

function withPool(url: string): string {
  return url.includes('?') ? `${url}&connection_limit=20` : `${url}?connection_limit=20`;
}

const PLATFORM = randomUUID();
const GROUP = randomUUID();
const BRAND = randomUUID();

function scope(customerId: string) {
  return { platformId: PLATFORM, groupId: GROUP, brandId: BRAND, customerId };
}
const groupScope = { platformId: PLATFORM, groupId: GROUP, brandId: null };

describe('Ledger & wallet correctness', () => {
  let prisma: PrismaClient;
  const tx = <T>(fn: (t: Tx) => Promise<T>) => prisma.$transaction(fn);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: withPool(dbUrl()) });
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('earns points and materializes the balance', async () => {
    const customer = randomUUID();
    const r = await tx((t) =>
      earnPoints(t, { scope: scope(customer), points: 500n, occurredAt: new Date(), idem: { actorId: customer, key: 'earn-1' } }),
    );
    expect(r.balance.available).toBe(500n);
  });

  it('is idempotent: replaying an earn does not double-credit', async () => {
    const customer = randomUUID();
    const idem = { actorId: customer, key: 'earn-dup' };
    const first = await tx((t) => earnPoints(t, { scope: scope(customer), points: 300n, occurredAt: new Date(), idem }));
    const second = await tx((t) => earnPoints(t, { scope: scope(customer), points: 300n, occurredAt: new Date(), idem }));
    expect(second.journalId).toBe(first.journalId);
    expect(second.balance.available).toBe(300n);
  });

  it('authorize reduces available; over-authorize is rejected', async () => {
    const customer = randomUUID();
    await tx((t) => earnPoints(t, { scope: scope(customer), points: 500n, occurredAt: new Date(), idem: { actorId: customer, key: 'e' } }));
    await tx((t) => authorizeRedeem(t, { scope: scope(customer), points: 300n, occurredAt: new Date(), idem: { actorId: customer, key: 'a1' } }));

    const asset = pointsAsset(BRAND);
    const acc = await tx((t) =>
      getOrCreateAccount(t, { ledger: 'points', accountType: 'points_liability', normalSide: 'credit', assetCode: asset, platformId: PLATFORM, groupId: GROUP, brandId: BRAND, customerId: customer }),
    );
    const bal = await tx((t) => getBalance(t, acc.id));
    expect(bal.available).toBe(200n);

    await expect(
      tx((t) => authorizeRedeem(t, { scope: scope(customer), points: 300n, occurredAt: new Date(), idem: { actorId: customer, key: 'a2' } })),
    ).rejects.toThrowError(LedgerError);
  });

  it('capture converts the hold to a posted spend', async () => {
    const customer = randomUUID();
    await tx((t) => earnPoints(t, { scope: scope(customer), points: 500n, occurredAt: new Date(), idem: { actorId: customer, key: 'e' } }));
    await tx((t) => authorizeRedeem(t, { scope: scope(customer), points: 300n, occurredAt: new Date(), idem: { actorId: customer, key: 'a' } }));
    await tx((t) => captureRedeem(t, { scope: scope(customer), points: 300n, occurredAt: new Date(), idem: { actorId: customer, key: 'c' } }));

    const asset = pointsAsset(BRAND);
    const acc = await tx((t) =>
      getOrCreateAccount(t, { ledger: 'points', accountType: 'points_liability', normalSide: 'credit', assetCode: asset, platformId: PLATFORM, groupId: GROUP, brandId: BRAND, customerId: customer }),
    );
    const bal = await tx((t) => getBalance(t, acc.id));
    expect(bal.available).toBe(200n);
    expect(bal.pending).toBe(0n);
  });

  it('void releases the hold and restores available', async () => {
    const customer = randomUUID();
    await tx((t) => earnPoints(t, { scope: scope(customer), points: 100n, occurredAt: new Date(), idem: { actorId: customer, key: 'e' } }));
    await tx((t) => authorizeRedeem(t, { scope: scope(customer), points: 40n, occurredAt: new Date(), idem: { actorId: customer, key: 'a' } }));
    await tx((t) => voidRedeem(t, { scope: scope(customer), points: 40n, occurredAt: new Date(), idem: { actorId: customer, key: 'v' } }));

    const asset = pointsAsset(BRAND);
    const acc = await tx((t) =>
      getOrCreateAccount(t, { ledger: 'points', accountType: 'points_liability', normalSide: 'credit', assetCode: asset, platformId: PLATFORM, groupId: GROUP, brandId: BRAND, customerId: customer }),
    );
    const bal = await tx((t) => getBalance(t, acc.id));
    expect(bal.available).toBe(100n);
  });

  it('rejects an unbalanced journal at commit (DB trigger)', async () => {
    const customer = randomUUID();
    const asset = pointsAsset(BRAND);
    const acc = await tx((t) =>
      getOrCreateAccount(t, { ledger: 'points', accountType: 'points_expense', normalSide: 'debit', assetCode: asset, platformId: PLATFORM, groupId: GROUP, brandId: BRAND, customerId: customer }),
    );
    await expect(
      tx((t) =>
        postJournal(t, {
          ledger: 'points',
          kind: 'adjust',
          occurredAt: new Date(),
          scope: scope(customer),
          applyBalances: false,
          legs: [{ accountId: acc.id, normalSide: 'debit', direction: 'debit', amountMinor: 100n, assetCode: asset }],
        }),
      ),
    ).rejects.toThrow();
  });

  it('prevents double-spend under concurrency (no overdraw)', async () => {
    const customer = randomUUID();
    await tx((t) => earnPoints(t, { scope: scope(customer), points: 1000n, occurredAt: new Date(), idem: { actorId: customer, key: 'seed' } }));

    // 10 concurrent authorizations of 200 against a 1000 balance → exactly 5 succeed.
    const attempts = Array.from({ length: 10 }, (_, i) =>
      tx((t) => authorizeRedeem(t, { scope: scope(customer), points: 200n, occurredAt: new Date(), idem: { actorId: customer, key: `cc-${i}` } })),
    );
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(5);

    const asset = pointsAsset(BRAND);
    const acc = await tx((t) =>
      getOrCreateAccount(t, { ledger: 'points', accountType: 'points_liability', normalSide: 'credit', assetCode: asset, platformId: PLATFORM, groupId: GROUP, brandId: BRAND, customerId: customer }),
    );
    const bal = await tx((t) => getBalance(t, acc.id));
    expect(bal.available).toBe(0n);
    expect(bal.available >= 0n).toBe(true);
  });

  it('tops up the wallet and draws down at the hybrid cost model', async () => {
    const r = await tx((t) =>
      topUpWallet(t, { scope: groupScope, currency: 'AED', amountMinor: 100000n, occurredAt: new Date(), idem: { actorId: GROUP, key: 'top-1' } }),
    );
    expect(r.balance.available).toBe(100000n);

    // 300 points @ 100 fils/point + 10% platform margin → cost 30000, fee 3000, total 33000.
    const d = await tx((t) =>
      drawdownWallet(t, {
        scope: groupScope,
        currency: 'AED',
        points: 300n,
        costPerPointMinor: 100n,
        platformMarginBps: 1000,
        occurredAt: new Date(),
        sourceEvent: 'pos-1',
        idem: { actorId: GROUP, key: 'dd-1' },
      }),
    );
    expect(d.costMinor).toBe(30000n);
    expect(d.feeMinor).toBe(3000n);
    expect(d.totalMinor).toBe(33000n);

    const acc = await tx((t) =>
      getOrCreateAccount(t, { ledger: 'wallet', accountType: 'wallet_liability', normalSide: 'credit', assetCode: 'AED', platformId: PLATFORM, groupId: GROUP, brandId: null }),
    );
    const bal = await tx((t) => getBalance(t, acc.id));
    expect(bal.available).toBe(67000n);
  });

  it('blocks a drawdown that would overdraw the wallet', async () => {
    const grp = randomUUID();
    const gs = { platformId: PLATFORM, groupId: grp, brandId: null };
    await tx((t) => topUpWallet(t, { scope: gs, currency: 'AED', amountMinor: 1000n, occurredAt: new Date(), idem: { actorId: grp, key: 't' } }));
    await expect(
      tx((t) =>
        drawdownWallet(t, { scope: gs, currency: 'AED', points: 100n, costPerPointMinor: 100n, platformMarginBps: 0, occurredAt: new Date(), idem: { actorId: grp, key: 'dd' } }),
      ),
    ).rejects.toThrowError(LedgerError); // 10000 > 1000
  });

  it('global invariant: every journal balances (Σ signed entries = 0)', async () => {
    const rows = await prisma.$queryRaw<{ imbalance: bigint | null }[]>`
      SELECT coalesce(sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END), 0) AS imbalance
        FROM entry`;
    expect(BigInt(rows[0]?.imbalance ?? 0n)).toBe(0n);
  });
});
