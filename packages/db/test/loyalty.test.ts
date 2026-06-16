/**
 * Phase 3 integration: the rules engine (@rfm-loyalty/shared) decides points, the
 * ledger engine awards them — proven end-to-end against embedded Postgres.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { type EarnRule, evaluateEarn } from '@rfm-loyalty/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureRedeem, earnPoints, getBalance, getOrCreateAccount, pointsAsset, authorizeRedeem, type Tx } from '../src/ledger';
import { dbUrl } from './db-url';

const PLATFORM = randomUUID();
const GROUP = randomUUID();
const BRAND = randomUUID();
const scope = (customerId: string) => ({ platformId: PLATFORM, groupId: GROUP, brandId: BRAND, customerId });

describe('Loyalty: rules → effects → ledger', () => {
  let prisma: PrismaClient;
  const tx = <T>(fn: (t: Tx) => Promise<T>) => prisma.$transaction(fn);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: dbUrl() });
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('awards rule-decided points and reflects them in the balance', async () => {
    const rules: EarnRule[] = [
      { id: 'r1', name: 'base', priority: 0, enabled: true, actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] },
      { id: 'r2', name: 'visit', priority: 1, enabled: true, actions: [{ type: 'perVisit', points: 10 }] },
    ];
    const decision = evaluateEarn(rules, { session: { amountMinor: 10000, isVisit: true } });
    expect(decision.points).toBe(110);

    const customer = randomUUID();
    const r = await tx((t) =>
      earnPoints(t, { scope: scope(customer), points: BigInt(decision.points), occurredAt: new Date(), idem: { actorId: customer, key: 'earn' } }),
    );
    expect(r.balance.available).toBe(110n);
  });

  it('redeems decided points down to the expected balance', async () => {
    const customer = randomUUID();
    await tx((t) => earnPoints(t, { scope: scope(customer), points: 500n, occurredAt: new Date(), idem: { actorId: customer, key: 'e' } }));
    await tx((t) => authorizeRedeem(t, { scope: scope(customer), points: 200n, occurredAt: new Date(), idem: { actorId: customer, key: 'a' } }));
    await tx((t) => captureRedeem(t, { scope: scope(customer), points: 200n, occurredAt: new Date(), idem: { actorId: customer, key: 'c' } }));

    const acc = await tx((t) =>
      getOrCreateAccount(t, { ledger: 'points', accountType: 'points_liability', normalSide: 'credit', assetCode: pointsAsset(BRAND), platformId: PLATFORM, groupId: GROUP, brandId: BRAND, customerId: customer }),
    );
    const bal = await tx((t) => getBalance(t, acc.id));
    expect(bal.available).toBe(300n);
  });
});
