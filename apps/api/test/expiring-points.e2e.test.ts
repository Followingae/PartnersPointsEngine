/**
 * `GET /customer/expiring` — the points a member is about to lose.
 *
 * The number this returns is a promise about the future, so the tests are about
 * agreeing with the thing that actually settles it. There is no lot table: the
 * expiry sweep decides what lapses by consuming debits FIFO against the earliest
 * expiry buckets, and this read has to reach the same answer or the app warns
 * about points that are already spent (or stays quiet about points about to go).
 */
import { randomUUID } from 'node:crypto';
import { ledger, PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EnvelopeCryptoService } from '../src/auth/crypto/envelope-crypto.service';
import { AuditService } from '../src/platform-core/audit/audit.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { CampaignService } from '../src/modules/loyalty-rules/campaign.service';
import { GamificationService } from '../src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from '../src/modules/loyalty-rules/loyalty.service';
import { ExpirySweepService } from '../src/modules/workers/expiry-sweep.service';

const cfg = { get: () => undefined, getOrThrow: () => 'x'.repeat(32) } as never;

/** A UTC-midnight date `days` from today, matching how DATE columns come back. */
function bucket(days: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
}
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

describe('Customer expiring points', () => {
  let prisma: PrismaClient;
  let loyalty: LoyaltyService;
  let sweep: ExpirySweepService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();

  let member: string;
  let stranger: string;

  const ctxFor = (actorId: string): TenantContext => ({
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'customer',
    actor: { type: 'customer', id: actorId, onBehalfOf: null },
  });
  const ctx = () => ctxFor(randomUUID());

  const scope = (customerId: string) => ({ platformId, groupId, brandId, customerId });

  const earn = (customerId: string, points: bigint, expiryBucket: Date | null) =>
    prisma.$transaction((tx) =>
      ledger.earnPoints(tx as never, {
        scope: scope(customerId),
        points,
        occurredAt: new Date(),
        expiryBucket,
        idem: { actorId: customerId, key: `e-${randomUUID()}` },
      }),
    );

  async function newMember(): Promise<string> {
    const person = await prisma.person.create({ data: { platformId } });
    const m = await prisma.customerMembership.create({
      data: { personId: person.id, brandId, groupId, platformId, loyaltyId: `L-${randomUUID().slice(0, 6)}` },
    });
    return m.id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    const audit = new AuditService();
    loyalty = new LoyaltyService(
      tenants,
      new CampaignService(tenants, audit),
      new GamificationService(tenants, audit),
      audit,
      new EnvelopeCryptoService(cfg),
    );
    sweep = new ExpirySweepService(tenants);

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'Expiry Co', slug: `x-${brandId.slice(0, 8)}` } });

    member = await newMember();
    stranger = await newMember();

    // Two future lots in different months, plus one that has already lapsed.
    await earn(member, 40n, bucket(-10));
    await earn(member, 120n, bucket(18));
    await earn(member, 60n, bucket(70));

    // The stranger banks a much larger, far-off lot at the same brand.
    await earn(stranger, 9_999n, bucket(200));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports only future buckets, grouped by the month they lapse', async () => {
    const r = await loyalty.expiring(ctx(), member);
    // The already-lapsed 40 is consumed but never reported: nothing to act on.
    expect(r.total).toBe('180');
    expect(r.buckets).toHaveLength(2);

    const [soon, later] = r.buckets;
    expect(soon!.month).toBe(monthOf(bucket(18)));
    expect(soon!.points).toBe('120');
    expect(soon!.from).toBe(bucket(18).toISOString().slice(0, 10));
    expect(soon!.daysLeft).toBe(18);

    expect(later!.points).toBe('60');
    expect(later!.daysLeft).toBe(70);
    // Soonest first, so the screen's first row is the urgent one.
    expect(soon!.daysLeft).toBeLessThan(later!.daysLeft);
  });

  it('never reports another member’s points', async () => {
    const r = await loyalty.expiring(ctx(), member);
    expect(BigInt(r.total)).toBeLessThan(9_999n);
    const mine = await loyalty.expiring(ctx(), stranger);
    expect(mine.total).toBe('9999');
  });

  it('a member with no account at all is simply empty, not an error', async () => {
    const fresh = await newMember();
    const r = await loyalty.expiring(ctx(), fresh);
    expect(r).toEqual({ total: '0', buckets: [] });
  });

  it('spending consumes the soonest-expiring points first', async () => {
    const spender = await newMember();
    await earn(spender, 100n, bucket(20));
    await earn(spender, 100n, bucket(50));

    await prisma.$transaction(async (tx) => {
      await ledger.authorizeRedeem(tx as never, {
        scope: scope(spender), points: 130n, occurredAt: new Date(),
        idem: { actorId: spender, key: `a-${randomUUID()}` },
      });
      await ledger.captureRedeem(tx as never, {
        scope: scope(spender), points: 130n, occurredAt: new Date(),
        idem: { actorId: spender, key: `c-${randomUUID()}` },
      });
    });

    const r = await loyalty.expiring(ctx(), spender);
    // The whole 20-day lot went first; only the remainder of the later one is left.
    expect(r.total).toBe('70');
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0]!.daysLeft).toBe(50);
  });

  it('points held for an authorised redemption are already committed, so are not warned about', async () => {
    const holder = await newMember();
    await earn(holder, 200n, bucket(25));
    await prisma.$transaction((tx) =>
      ledger.authorizeRedeem(tx as never, {
        scope: scope(holder), points: 150n, occurredAt: new Date(),
        idem: { actorId: holder, key: `h-${randomUUID()}` },
      }),
    );

    const r = await loyalty.expiring(ctx(), holder);
    expect(r.total).toBe('50');
  });

  it('points earned without an expiry bucket never appear, and are spent last', async () => {
    const forever = await newMember();
    await earn(forever, 80n, null);
    await earn(forever, 30n, bucket(15));

    const before = await loyalty.expiring(ctx(), forever);
    expect(before.total).toBe('30');

    // A spend smaller than the expiring lot still eats that lot, not the
    // never-expiring one — the sweep would settle it the same way.
    await prisma.$transaction(async (tx) => {
      await ledger.authorizeRedeem(tx as never, {
        scope: scope(forever), points: 20n, occurredAt: new Date(),
        idem: { actorId: forever, key: `f1-${randomUUID()}` },
      });
      await ledger.captureRedeem(tx as never, {
        scope: scope(forever), points: 20n, occurredAt: new Date(),
        idem: { actorId: forever, key: `f2-${randomUUID()}` },
      });
    });

    const after = await loyalty.expiring(ctx(), forever);
    expect(after.total).toBe('10');
  });

  /**
   * The load-bearing one: whatever this read says is safe must survive the
   * sweep, and whatever it declines to report must be what the sweep takes.
   */
  it('agrees with the expiry sweep about what actually lapses', async () => {
    const swept = await newMember();
    await earn(swept, 70n, bucket(-5));
    await earn(swept, 90n, bucket(30));

    const before = await loyalty.expiring(ctx(), swept);
    expect(before.total).toBe('90');

    const result = await sweep.sweepBrand(ctxFor(randomUUID()));
    expect(BigInt(result.pointsExpired)).toBeGreaterThanOrEqual(70n);

    // The 90 the read promised is still there once the sweep has run.
    const after = await loyalty.expiring(ctx(), swept);
    expect(after.total).toBe('90');
    const balance = await loyalty.balance(ctx(), swept);
    expect(balance.available).toBe('90');
  });
});
