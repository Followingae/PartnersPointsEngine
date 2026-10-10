/**
 * Referral anti-abuse. The ledger credits real liability, so the only thing
 * between the program and unlimited minting is these guards. The headline
 * exploit was "ping-pong": two accounts referring each other in a loop.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, ledger } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { ReferralService } from '../src/modules/loyalty-rules/referral.service';

describe('Referral anti-abuse', () => {
  let prisma: PrismaClient;
  let referrals: ReferralService;
  let tenants: TenantService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const ctx: TenantContext = {
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'customer',
    actor: { type: 'customer', id: randomUUID(), onBehalfOf: null },
  };

  const newMember = async (loyaltyId: string, joinedAt = new Date()) => {
    const person = await prisma.person.create({ data: { platformId, phoneHash: randomUUID() } });
    const m = await prisma.customerMembership.create({
      data: { personId: person.id, brandId, groupId, platformId, loyaltyId, joinedAt },
    });
    return m.id;
  };

  const balance = async (membershipId: string) =>
    tenants.run(ctx, async (tx) => {
      const acct = await tx.ledgerAccount.findFirst({ where: { brandId, customerId: membershipId, accountType: 'points_liability' } });
      if (!acct) return 0n;
      const b = await ledger.getBalance(tx, acct.id);
      return b.available;
    });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    tenants = new TenantService(prisma as never);
    referrals = new ReferralService(tenants);
    await prisma.platform.create({ data: { id: platformId, name: 'A' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'Ref Cafe', slug: `r-${brandId.slice(0, 8)}` } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rewards a genuine first referral', async () => {
    const a = await newMember('A-1');
    const b = await newMember('B-1');
    const { code } = await referrals.getOrCreateCode(ctx, a);
    const res = await referrals.redeem(ctx, code, b);
    expect(res.status).toBe('rewarded');
    expect(await balance(a)).toBe(100n);
    expect(await balance(b)).toBe(50n);
  });

  it('blocks the reciprocal (ping-pong) referral', async () => {
    const a = await newMember('A-2');
    const b = await newMember('B-2');
    const { code: ca } = await referrals.getOrCreateCode(ctx, a);
    await referrals.redeem(ctx, ca, b); // a refers b — allowed
    const { code: cb } = await referrals.getOrCreateCode(ctx, b);
    // b now tries to refer a back: reciprocal, must be rejected
    await expect(referrals.redeem(ctx, cb, a)).rejects.toThrow(/reciprocal/i);
  });

  it('rejects a member who has already been referred', async () => {
    const a = await newMember('A-3');
    const b = await newMember('B-3');
    const c = await newMember('C-3');
    const { code: ca } = await referrals.getOrCreateCode(ctx, a);
    await referrals.redeem(ctx, ca, b);
    const { code: cc } = await referrals.getOrCreateCode(ctx, c);
    // b was already a referee once — cannot be referred again
    await expect(referrals.redeem(ctx, cc, b)).rejects.toThrow(/already used a referral/i);
  });

  it('rejects an old (non-new) member as referee', async () => {
    const a = await newMember('A-4');
    const old = await newMember('OLD-4', new Date(Date.now() - 30 * 86_400_000));
    const { code } = await referrals.getOrCreateCode(ctx, a);
    await expect(referrals.redeem(ctx, code, old)).rejects.toThrow(/new members/i);
  });
});
