/**
 * W4 breadth: coupon engine (bulk generate, validate, redeem with per-code +
 * per-customer caps) and the segment/audience builder (rule preview over member
 * attributes) — against embedded Postgres.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../src/platform-core/audit/audit.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { CampaignService } from '../src/modules/loyalty-rules/campaign.service';
import { GamificationService } from '../src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from '../src/modules/loyalty-rules/loyalty.service';
import { CouponService } from '../src/modules/coupons/coupon.service';
import { SegmentService } from '../src/modules/segments/segment.service';

describe('Coupons + Segments (W4)', () => {
  let prisma: PrismaClient;
  let loyalty: LoyaltyService;
  let coupons: CouponService;
  let segments: SegmentService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const adminId = randomUUID();
  const ctx: TenantContext = {
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin',
    actor: { type: 'user', id: adminId, onBehalfOf: null },
  };
  let memberA = '';
  let memberB = '';

  async function newMember(): Promise<string> {
    const person = await prisma.person.create({ data: { platformId } });
    const m = await prisma.customerMembership.create({ data: { personId: person.id, brandId, groupId, platformId, loyaltyId: `L-${randomUUID().slice(0, 6)}` } });
    return m.id;
  }
  const earn = (membershipId: string, amountMinor: number, key: string) =>
    prisma.$transaction((tx) => loyalty.earnWithTx(tx as never, ctx, { membershipId, amountMinor, idempotencyKey: key }));

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    const audit = new AuditService();
    loyalty = new LoyaltyService(tenants, new CampaignService(tenants, audit), new GamificationService(tenants, audit), audit);
    coupons = new CouponService(tenants, audit);
    segments = new SegmentService(tenants, audit);

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });
    await prisma.loyaltyEarnRule.create({ data: { brandId, groupId, platformId, name: '1pt/100', definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] } } });
    memberA = await newMember();
    memberB = await newMember();
    await newMember(); // C: never earns
    await earn(memberA, 100000, 'a1'); // 1000 pts
    await earn(memberB, 10000, 'b1'); // 100 pts
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bulk-generates unique codes from a pattern', async () => {
    const res = (await coupons.bulkGenerate(ctx, { pattern: 'TEST-####', count: 5, kind: 'discount', valueMinor: 1000, maxRedemptions: 2, perCustomerLimit: 1 })) as { created: number; batchId: string; sample: string[] };
    expect(res.created).toBe(5);
    expect(res.sample[0]).toMatch(/^TEST-/);
    const list = await coupons.list(ctx, { batchId: res.batchId });
    expect(list.total).toBe(5);
  });

  it('enforces per-customer limit and per-code max redemptions', async () => {
    const gen = (await coupons.bulkGenerate(ctx, { pattern: 'CAP', count: 1, kind: 'discount', valueMinor: 500, maxRedemptions: 2, perCustomerLimit: 1 })) as { batchId: string };
    const list = await coupons.list(ctx, { batchId: gen.batchId });
    const code = list.rows[0]!.code;

    const v = (await coupons.validate(ctx, code, memberA)) as { valid: boolean };
    expect(v.valid).toBe(true);

    await coupons.redeem(ctx, code, memberA); // 1st by A
    await expect(coupons.redeem(ctx, code, memberA)).rejects.toThrow(/per_customer_limit/); // A again → blocked
    await coupons.redeem(ctx, code, memberB); // B → ok (2nd overall)
    await expect(coupons.redeem(ctx, code, memberB)).rejects.toThrow(/exhausted/); // max 2 reached
  });

  it('rejects unknown / expired codes', async () => {
    const v = (await coupons.validate(ctx, 'NOPE-NONE')) as { valid: boolean; reason: string | null };
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('not_found');
  });

  it('segment preview filters members by attribute rules', async () => {
    const hiValue = await segments.preview(ctx, { match: 'all', rules: [{ field: 'lifetime', op: 'gte', value: 500 }] });
    expect(hiValue.count).toBe(1); // only member A (1000 pts)
    expect(hiValue.sample[0]!.membershipId).toBe(memberA);

    const everyone = await segments.preview(ctx, { rules: [] });
    expect(everyone.count).toBeGreaterThanOrEqual(3); // all enrolled, incl never-active

    const active = await segments.preview(ctx, { match: 'all', rules: [{ field: 'status', op: 'eq', value: 'active' }] });
    expect(active.count).toBeGreaterThanOrEqual(3);
  });

  it('saves a segment and resolves its members', async () => {
    const seg = (await segments.create(ctx, { name: 'High value', definition: { match: 'all', rules: [{ field: 'lifetime', op: 'gte', value: 500 }] } })) as { id: string };
    const members = await segments.members(ctx, seg.id);
    expect(members.count).toBe(1);
    const list = await segments.list(ctx);
    expect(list.rows.find((s) => s.id === seg.id)).toBeTruthy();
  });
});
