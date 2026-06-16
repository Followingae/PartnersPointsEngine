/**
 * W3 analytics: CLV, visit frequency / most-frequent-visitor, churn risk,
 * engagement funnel + repeat rate, cohort retention, liability aging, per-branch
 * — computed live off the ledger against embedded Postgres.
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
import { AnalyticsService } from '../src/modules/reporting/analytics.service';

describe('Analytics suite (W3)', () => {
  let prisma: PrismaClient;
  let loyalty: LoyaltyService;
  let analytics: AnalyticsService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const adminId = randomUUID();

  const ctx: TenantContext = {
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin',
    actor: { type: 'user', id: adminId, onBehalfOf: null },
  };

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
    analytics = new AnalyticsService(tenants);

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });
    await prisma.loyaltyEarnRule.create({ data: { brandId, groupId, platformId, name: '1pt/100', definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] } } });

    const a = await newMember();
    const b = await newMember();
    await newMember(); // c: joined, never earns
    await earn(a, 50000, 'a1'); // 500 pts
    await earn(a, 30000, 'a2');
    await earn(a, 20000, 'a3'); // a has 3 visits, repeat
    await earn(b, 10000, 'b1'); // b has 1 visit
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('CLV: summary + distribution + ranked top members', async () => {
    const r = await analytics.clv(ctx);
    expect(r.summary.members).toBeGreaterThanOrEqual(3);
    expect(BigInt(r.summary.totalLifetime)).toBeGreaterThan(0n);
    expect(r.distribution.reduce((s, d) => s + d.members, 0)).toBe(r.summary.members);
    expect(r.top.length).toBeGreaterThanOrEqual(2);
    // top member is the highest lifetime (member a = 1000 pts)
    expect(BigInt(r.top[0]!.lifetime)).toBeGreaterThanOrEqual(BigInt(r.top[1]!.lifetime));
  });

  it('visit frequency: leaderboard + histogram', async () => {
    const r = await analytics.visitFrequency(ctx);
    expect(r.leaderboard[0]!.visits).toBe(3); // member a, most frequent
    expect(r.histogram.reduce((s, h) => s + h.members, 0)).toBeGreaterThanOrEqual(2);
  });

  it('engagement: funnel + repeat rate', async () => {
    const r = await analytics.engagement(ctx);
    const joined = r.funnel.find((f) => f.stage === 'Joined')!.count;
    const first = r.funnel.find((f) => f.stage === 'First earn')!.count;
    const repeat = r.funnel.find((f) => f.stage === 'Repeat earn')!.count;
    expect(joined).toBeGreaterThanOrEqual(3);
    expect(first).toBeGreaterThanOrEqual(2);
    expect(repeat).toBeGreaterThanOrEqual(1);
    expect(r.repeatRate).toBeGreaterThan(0);
  });

  it('churn risk: buckets cover all members; recent earners are active', async () => {
    const r = await analytics.churnRisk(ctx);
    const total = r.buckets.reduce((s, b) => s + b.members, 0);
    expect(total).toBeGreaterThanOrEqual(3);
    expect(r.buckets.find((b) => b.bucket === 'active')!.members).toBeGreaterThanOrEqual(2);
  });

  it('liability aging + per-branch + cohorts return well-formed shapes', async () => {
    const aging = await analytics.liabilityAging(ctx);
    expect(Array.isArray(aging)).toBe(true);
    expect(aging.length).toBeGreaterThanOrEqual(1); // earns set a 12-month expiry bucket

    const branches = await analytics.byBranch(ctx);
    expect(Array.isArray(branches)).toBe(true);

    const cohorts = await analytics.cohortRetention(ctx);
    expect(cohorts.offsets).toBeGreaterThan(0);
    expect(Array.isArray(cohorts.cohorts)).toBe(true);
    expect(cohorts.cohorts[0]!.retention[0]).toBeGreaterThan(0); // month-0 retention > 0
  });

  it('CSV exports have headers + rows', async () => {
    const csv = await analytics.clvCsv(ctx);
    expect(csv.split('\n')[0]).toContain('membershipId,loyaltyId,lifetime');
    expect(csv.trim().split('\n').length).toBeGreaterThan(1);
  });
});
