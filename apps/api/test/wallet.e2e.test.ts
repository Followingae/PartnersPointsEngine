/**
 * The customer app's wallet surface: person-scoped reads that span brands.
 *
 * The point of these tests is the boundary. Loyalty data is isolated by brand
 * and a wallet has no brand, so every read goes through SECURITY DEFINER
 * functions keyed by person id — which means the isolation those functions
 * provide is the only thing standing between one customer and another's cards.
 */
import { randomUUID } from 'node:crypto';
import { ledger, PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EnvelopeCryptoService } from '../src/auth/crypto/envelope-crypto.service';
import { CustomerWalletService } from '../src/modules/customer-wallet/wallet.service';

const cfg = { get: () => undefined, getOrThrow: () => 'x'.repeat(32) } as never;

describe('Customer wallet (person-scoped, spans brands)', () => {
  let prisma: PrismaClient;
  let wallet: CustomerWalletService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandA = randomUUID();
  const brandB = randomUUID();

  let personId: string;
  let strangerId: string;
  let membershipA: string;
  let membershipB: string;

  const scope = (brandId: string, customerId: string) => ({
    platformId, groupId, brandId, customerId,
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    wallet = new CustomerWalletService(prisma as never, new EnvelopeCryptoService(cfg));

    await prisma.platform.create({ data: { id: platformId, name: 'W' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    for (const [id, name] of [[brandA, 'Alpha Coffee'], [brandB, 'Beta Bakery']] as const) {
      await prisma.brand.create({
        data: { id, groupId, platformId, name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${id.slice(0, 6)}` },
      });
    }
    // Alpha has tiers so the card can report progress toward the next one.
    await prisma.tier.createMany({
      data: [
        { brandId: brandA, groupId, platformId, name: 'Bronze', threshold: 0n },
        { brandId: brandA, groupId, platformId, name: 'Silver', threshold: 100n },
        { brandId: brandA, groupId, platformId, name: 'Gold', threshold: 500n },
      ],
    });

    const person = await prisma.person.create({ data: { platformId, fullName: 'Wallet Tester' } });
    personId = person.id;
    const stranger = await prisma.person.create({ data: { platformId, fullName: 'Someone Else' } });
    strangerId = stranger.id;

    membershipA = (await prisma.customerMembership.create({
      data: { personId, brandId: brandA, groupId, platformId, loyaltyId: `A-${randomUUID().slice(0, 6)}` },
    })).id;
    membershipB = (await prisma.customerMembership.create({
      data: { personId, brandId: brandB, groupId, platformId, loyaltyId: `B-${randomUUID().slice(0, 6)}` },
    })).id;
    // The stranger banks points at the same brand, so a leak would be visible.
    const strangerMembership = (await prisma.customerMembership.create({
      data: { personId: strangerId, brandId: brandA, groupId, platformId, loyaltyId: `S-${randomUUID().slice(0, 6)}` },
    })).id;

    await prisma.$transaction(async (tx) => {
      await ledger.earnPoints(tx as never, {
        scope: scope(brandA, membershipA), points: 250n, occurredAt: new Date(),
        idem: { actorId: personId, key: `a-${randomUUID()}` },
      });
      await ledger.earnPoints(tx as never, {
        scope: scope(brandB, membershipB), points: 40n, occurredAt: new Date(),
        idem: { actorId: personId, key: `b-${randomUUID()}` },
      });
      await ledger.earnPoints(tx as never, {
        scope: scope(brandA, strangerMembership), points: 9_999n, occurredAt: new Date(),
        idem: { actorId: strangerId, key: `s-${randomUUID()}` },
      });
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns one card per brand the person belongs to, with live balances', async () => {
    const cards = await wallet.cards(personId);
    expect(cards).toHaveLength(2);

    const alpha = cards.find((c) => c.brandName === 'Alpha Coffee')!;
    const beta = cards.find((c) => c.brandName === 'Beta Bakery')!;
    expect(alpha.available).toBe('250');
    expect(beta.available).toBe('40');
    // Never another member's balance, even at a brand they share.
    expect(cards.some((c) => c.available === '9999')).toBe(false);
  });

  it('reports the tier reached and the progress toward the next one', async () => {
    const alpha = (await wallet.cards(personId)).find((c) => c.brandName === 'Alpha Coffee')!;
    expect(alpha.tier).toBe('Silver');
    expect(alpha.nextTier).toBe('Gold');
    // 250 lifetime sits 150 into the 400-point run from Silver to Gold.
    expect(alpha.progressPct).toBe(38);
    expect(alpha.toNextTier).toBe('250');
  });

  it('a brand with no tiers reports no progress rather than a false 0%', async () => {
    const beta = (await wallet.cards(personId)).find((c) => c.brandName === 'Beta Bakery')!;
    expect(beta.tier).toBeNull();
    expect(beta.toNextTier).toBeNull();
  });

  it('merges every brand into one activity timeline, newest first', async () => {
    const feed = await wallet.activity(personId);
    expect(feed.length).toBeGreaterThanOrEqual(2);
    expect(feed.map((e) => e.brandName).sort()).toEqual(['Alpha Coffee', 'Beta Bakery']);
    expect(feed.every((e) => e.title === 'Points earned')).toBe(true);
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i - 1]!.at.getTime()).toBeGreaterThanOrEqual(feed[i]!.at.getTime());
    }
  });

  it('shows a gifted reward, which costs no points and so never reaches the ledger', async () => {
    await prisma.voucher.create({
      data: {
        brandId: brandA, groupId, platformId, membershipId: membershipA,
        code: `GIFT-${randomUUID().slice(0, 8)}`, pointsSpent: 0n,
      },
    });
    const vouchers = await wallet.vouchers(personId);
    expect(vouchers).toHaveLength(1);
    expect(vouchers[0]!.brandName).toBe('Alpha Coffee');

    const feed = await wallet.activity(personId);
    const gifted = feed.find((e) => e.type === 'voucher_issued');
    expect(gifted?.title).toContain('gifted');
    expect(gifted?.points).toBeNull();
  });

  it('never returns another person’s wallet', async () => {
    const theirs = await wallet.cards(strangerId);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]!.available).toBe('9999');
    expect(await wallet.vouchers(strangerId)).toHaveLength(0);

    const mine = await wallet.cards(personId);
    expect(mine.map((c) => c.membershipId).sort()).toEqual([membershipA, membershipB].sort());
  });

  it('reads and updates the person’s own profile', async () => {
    const before = await wallet.profile(personId);
    expect(before.fullName).toBe('Wallet Tester');

    const after = await wallet.updateProfile(personId, { fullName: 'Zain Ahmed', gender: 'male' });
    expect(after.fullName).toBe('Zain Ahmed');
    expect(after.gender).toBe('male');

    // An absent field must leave the stored value alone, not blank it.
    const partial = await wallet.updateProfile(personId, { gender: 'female' });
    expect(partial.fullName).toBe('Zain Ahmed');
  });

  it('joins a brand from the app, and the till can then recognise the customer', async () => {
    const outsider = await prisma.person.create({ data: { platformId, fullName: 'New Joiner' } });
    expect(await wallet.cards(outsider.id)).toHaveLength(0);

    const joined = await wallet.joinBrand(outsider.id, brandB);
    expect(joined.alreadyMember).toBe(false);
    expect(joined.loyaltyId).toMatch(/^PP-/);

    const cards = await wallet.cards(outsider.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.brandName).toBe('Beta Bakery');
    expect(cards[0]!.available).toBe('0');

    // Joining in the app is worth nothing if a till can't find them afterwards.
    const scannable = await prisma.customerIdentifier.findFirst({
      where: { membershipId: joined.membershipId, type: 'qr' },
    });
    expect(scannable).not.toBeNull();
  });

  it('re-joining a card you already hold is a no-op, not an error', async () => {
    const again = await wallet.joinBrand(personId, brandA);
    expect(again.alreadyMember).toBe(true);
    expect(again.membershipId).toBe(membershipA);
    // Still one card, not two.
    expect((await wallet.cards(personId)).filter((c) => c.brandId === brandA)).toHaveLength(1);
  });

  it('lists joinable brands and marks the ones already held', async () => {
    const brands = (await wallet.brands(personId)) as Array<{ brandName: string; joined: boolean }>;
    const alpha = brands.find((b) => b.brandName === 'Alpha Coffee');
    expect(alpha?.joined).toBe(true);
    expect(brands.length).toBeGreaterThanOrEqual(2);
  });
});
