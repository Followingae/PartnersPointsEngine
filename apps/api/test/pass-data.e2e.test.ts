/**
 * Can a pass actually be built for a real card?
 *
 * This is the test that was missing. wallet-pass.test.ts proves a pass signs
 * correctly, but it hands the builder a hand-written object — so when the real
 * reader returned nothing under row-level security, every unit test still
 * passed and the endpoint 404'd for every card in production.
 *
 * So this one uses the database: real membership, real brand, real ledger, and
 * the same connection the API uses.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPassData } from '../src/modules/wallet-pass/pass-data';

describe('Pass data', () => {
  let prisma: PrismaClient;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  let personId: string;
  let membershipId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({
      data: {
        id: brandId, groupId, platformId, name: 'Camel Bean',
        slug: `b-${brandId.slice(0, 8)}`,
        pointsCurrencyCode: 'BEANS',
        branding: { primaryColor: '#15150F' },
      },
    });
    const person = await prisma.person.create({
      data: { platformId, fullName: 'Maya Khoury' },
    });
    personId = person.id;
    const m = await prisma.customerMembership.create({
      data: { personId, brandId, groupId, platformId, loyaltyId: 'CB44179K2D' },
    });
    membershipId = m.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns a card the caller owns', async () => {
    const d = await buildPassData(prisma, membershipId, 'https://partnerspoints.ae', personId);

    expect(d).not.toBeNull();
    expect(d!.brandName).toBe('Camel Bean');
    expect(d!.loyaltyId).toBe('CB44179K2D');
    expect(d!.pointsCode).toBe('BEANS');
    expect(d!.color).toBe('#15150F');
    // A zero balance is still a balance; null here would render an empty pass.
    expect(d!.balance).toBe('0');
  });

  it('shortens the member name the way a pass field needs', async () => {
    const d = await buildPassData(prisma, membershipId, 'https://partnerspoints.ae', personId);
    expect(d!.memberName).toBe('Maya K.');
    expect(d!.memberSince).toMatch(/^\d{4}$/);
  });

  it('refuses a card belonging to somebody else', async () => {
    const other = await prisma.person.create({ data: { platformId } });
    const d = await buildPassData(prisma, membershipId, 'https://x', other.id);
    // Not-found rather than a thrown error: an id that is not yours should not
    // be distinguishable from one that does not exist.
    expect(d).toBeNull();
  });

  it('serves the PassKit path, which has no person to check against', async () => {
    // The web service holds only a serial number; the pass's own token is what
    // authorised the call, so omitting personId must still return the card.
    const d = await buildPassData(prisma, membershipId, 'https://partnerspoints.ae');
    expect(d).not.toBeNull();
    expect(d!.membershipId).toBe(membershipId);
  });

  it('returns null for a membership that does not exist', async () => {
    expect(await buildPassData(prisma, randomUUID(), 'https://x')).toBeNull();
  });
});
