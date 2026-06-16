/**
 * Phase 6 integration: reporting (brand summary, RFM segmentation, superadmin
 * overview) and the FIFO point-expiry/breakage sweep — against embedded Postgres.
 */
import { randomUUID } from 'node:crypto';
import { ledger, PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReportingService } from '../src/modules/reporting/reporting.service';
import { ExpirySweepService } from '../src/modules/workers/expiry-sweep.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';

describe('Reporting + expiry (Phase 6)', () => {
  let prisma: PrismaClient;
  let reporting: ReportingService;
  let expiry: ExpirySweepService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const adminId = randomUUID();

  const ctx: TenantContext = { platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin', actor: { type: 'user', id: adminId, onBehalfOf: null } };
  const platformCtx: TenantContext = { ...ctx, brandId: null, scopeLevel: 'platform', surface: 'superadmin', actor: { type: 'system', id: adminId, onBehalfOf: null } };

  const earn = (customerId: string, points: bigint, key: string, expiryBucket?: Date) =>
    prisma.$transaction((tx) =>
      ledger.earnPoints(tx as never, { scope: { platformId, groupId, brandId, customerId }, points, occurredAt: new Date(), idem: { actorId: adminId, key }, expiryBucket }),
    );

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    reporting = new ReportingService(tenants);
    expiry = new ExpirySweepService(tenants);

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });

    await earn('m1', 1000n, 'm1');
    await earn('m2', 500n, 'm2');
    await earn('m3', 100n, 'm3');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports brand KPIs (earned, liability, members)', async () => {
    const s = await reporting.brandSummary(ctx);
    expect(s.pointsEarned).toBe('1600');
    expect(s.pointsLiability).toBe('1600');
    expect(s.members).toBe(3);
  });

  it('computes RFM scores + segments per member', async () => {
    const rfm = await reporting.rfm(ctx);
    expect(rfm.length).toBe(3);
    for (const row of rfm) {
      expect(row.r).toBeGreaterThanOrEqual(1);
      expect(row.m).toBeLessThanOrEqual(5);
      expect(typeof row.segment).toBe('string');
    }
    // The 1000-pt member should have the top monetary score (ntile buckets 1..N).
    const top = rfm.find((r) => r.membershipId === 'm1')!;
    expect(top.m).toBe(Math.max(...rfm.map((r) => r.m)));
  });

  it('rolls up daily metrics and persists an RFM snapshot', async () => {
    const roll = await reporting.runDailyRollup(ctx);
    expect(BigInt(roll.earned)).toBeGreaterThanOrEqual(1600n);
    const snap = await reporting.snapshotRfm(ctx);
    expect(snap.snapshot).toBe(3);
  });

  it('expires points past their bucket via FIFO breakage', async () => {
    const past = new Date(Date.now() - 2 * 86_400_000); // 2 days ago
    await earn('exp', 400n, 'exp-earn', past);
    const before = await prisma.$transaction((tx) =>
      ledger.getOrCreateAccount(tx as never, { ledger: 'points', accountType: 'points_liability', normalSide: 'credit', assetCode: `PTS:${brandId}`, platformId, groupId, brandId, customerId: 'exp' }),
    );
    const balBefore = await prisma.$transaction((tx) => ledger.getBalance(tx as never, before.id));
    expect(balBefore.available).toBe(400n);

    const res = await expiry.sweepBrand(ctx);
    expect(BigInt(res.pointsExpired)).toBeGreaterThanOrEqual(400n);

    const balAfter = await prisma.$transaction((tx) => ledger.getBalance(tx as never, before.id));
    expect(balAfter.available).toBe(0n);

    // Idempotent: a second sweep expires nothing more for this account.
    const res2 = await expiry.sweepBrand(ctx);
    const balFinal = await prisma.$transaction((tx) => ledger.getBalance(tx as never, before.id));
    expect(balFinal.available).toBe(0n);
    void res2;
  });

  it('reports platform-wide overview for the superadmin', async () => {
    const o = await reporting.superadminOverview(platformCtx);
    expect(BigInt(o.pointsLiabilityOutstanding)).toBeGreaterThan(0n);
    expect(o.brands).toBeGreaterThanOrEqual(1);
  });
});
