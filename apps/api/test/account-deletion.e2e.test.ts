/**
 * Account deletion: scheduled, cancellable, and — when it lands — actually
 * destructive of identity while leaving the merchant's books intact.
 *
 * Both stores require deletion to complete without staff involvement, so the
 * sweep is the thing under test, not the request. The other half is that
 * "deleted" must not mean "ledger rewritten": a merchant's reported revenue
 * cannot change because a customer left.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/customer-wallet/deletion.service';

describe('Account deletion', () => {
  let prisma: PrismaClient;
  let service: AccountDeletionService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();

  /** A person with every identifying field populated, plus a card. */
  async function newPerson() {
    const person = await prisma.person.create({
      data: {
        platformId,
        fullName: 'Maya Khoury',
        phoneEnc: Buffer.from('+971501234567'),
        emailEnc: Buffer.from('maya@example.ae'),
        birthdate: new Date('1994-03-02'),
        nationality: 'LB',
      },
    });
    const membership = await prisma.customerMembership.create({
      data: {
        personId: person.id, brandId, groupId, platformId,
        loyaltyId: `L-${randomUUID().slice(0, 6)}`,
      },
    });
    return { personId: person.id, membershipId: membership.id };
  }

  /** Force a scheduled deletion to be due without waiting thirty days. */
  const makeDue = (personId: string) =>
    prisma.$executeRaw`UPDATE account_deletion SET scheduled_for = now() - interval '1 hour' WHERE person_id = ${personId}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    service = new AccountDeletionService(prisma as never, {
      get: () => undefined,
    } as never);

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({
      data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('schedules thirty days out by default', async () => {
    const { personId } = await newPerson();
    const r = await service.request(personId);

    expect(r.pending).toBe(true);
    expect(r.noticeDays).toBe(30);
    const days = (r.scheduledFor.getTime() - r.requestedAt.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('reports the pending state back to the app', async () => {
    const { personId } = await newPerson();
    expect((await service.status(personId)).pending).toBe(false);

    await service.request(personId);
    const s = await service.status(personId);
    expect(s.pending).toBe(true);
    expect(s.scheduledFor).toBeInstanceOf(Date);
  });

  it('asking twice does not push the date further out', async () => {
    const { personId } = await newPerson();
    const first = await service.request(personId);
    const second = await service.request(personId);

    // Otherwise a customer tapping delete repeatedly postpones it forever.
    expect(second.scheduledFor.getTime()).toBe(first.scheduledFor.getTime());
  });

  it('cancels, and a cancelled account is left completely alone', async () => {
    const { personId } = await newPerson();
    await service.request(personId);
    expect(await service.cancel(personId)).toEqual({ cancelled: true });
    expect((await service.status(personId)).pending).toBe(false);

    await makeDue(personId);
    await service.sweep();

    const person = await prisma.person.findUnique({ where: { id: personId } });
    expect(person!.fullName).toBe('Maya Khoury');
    expect(person!.status).toBe('active');
  });

  it('cancelling then re-requesting starts a fresh window', async () => {
    const { personId } = await newPerson();
    const first = await service.request(personId);
    await service.cancel(personId);
    const again = await service.request(personId);

    expect(again.scheduledFor.getTime()).toBeGreaterThanOrEqual(first.scheduledFor.getTime());
    expect((await service.status(personId)).pending).toBe(true);
  });

  it('cancelling when nothing is scheduled is harmless', async () => {
    const { personId } = await newPerson();
    expect(await service.cancel(personId)).toEqual({ cancelled: false });
  });

  it('leaves a request that is not yet due untouched', async () => {
    const { personId } = await newPerson();
    await service.request(personId);
    await service.sweep();

    const person = await prisma.person.findUnique({ where: { id: personId } });
    expect(person!.fullName).toBe('Maya Khoury');
    expect((await service.status(personId)).pending).toBe(true);
  });

  describe('when the deletion comes due', () => {
    it('destroys every identifying field', async () => {
      const { personId } = await newPerson();
      await service.request(personId);
      await makeDue(personId);

      expect(await service.sweep()).toEqual({ completed: 1 });

      const person = await prisma.person.findUnique({ where: { id: personId } });
      expect(person!.fullName).toBeNull();
      expect(person!.birthdate).toBeNull();
      expect(person!.nationality).toBeNull();
      // Nulled rather than overwritten: no ciphertext survives to be attacked.
      expect(person!.phoneEnc).toBeNull();
      expect(person!.emailEnc).toBeNull();
      expect(person!.status).toBe('archived');
    });

    it('archives the cards so no balance stays spendable', async () => {
      const { personId, membershipId } = await newPerson();
      await service.request(personId);
      await makeDue(personId);
      await service.sweep();

      const m = await prisma.customerMembership.findUnique({ where: { id: membershipId } });
      expect(m!.status).toBe('archived');
    });

    it('keeps the membership row, because the ledger points at it', async () => {
      const { personId, membershipId } = await newPerson();
      await service.request(personId);
      await makeDue(personId);
      await service.sweep();

      // Deleting this would orphan every journal line referencing it and
      // silently restate figures the merchant has already reported.
      const m = await prisma.customerMembership.findUnique({ where: { id: membershipId } });
      expect(m).not.toBeNull();
      expect(m!.loyaltyId).toBeTruthy();
    });

    it('is not reported as pending afterwards, and does not run twice', async () => {
      const { personId } = await newPerson();
      await service.request(personId);
      await makeDue(personId);

      expect(await service.sweep()).toEqual({ completed: 1 });
      expect((await service.status(personId)).pending).toBe(false);
      // A completed row must not be picked up again on the next pass.
      expect(await service.sweep()).toEqual({ completed: 0 });
    });

    it('sweeps several at once and reports them in the queue beforehand', async () => {
      const a = await newPerson();
      const b = await newPerson();
      await service.request(a.personId, 'moving abroad');
      await service.request(b.personId);
      await makeDue(a.personId);
      await makeDue(b.personId);

      const queue = await service.pending();
      const ids = queue.map((q) => q.person_id);
      expect(ids).toContain(a.personId);
      expect(queue.find((q) => q.person_id === a.personId)!.reason).toBe('moving abroad');

      const { completed } = await service.sweep();
      expect(completed).toBeGreaterThanOrEqual(2);
    });
  });
});
