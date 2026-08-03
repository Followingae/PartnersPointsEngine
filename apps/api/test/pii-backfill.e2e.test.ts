/**
 * Re-encrypting PII that was stored in the clear.
 *
 * Seven of ten production rows held phone numbers as plain text in a column
 * meant to be encrypted, and every read of them failed inside a `catch` that
 * returned null — so those customers looked unreachable and their messages were
 * dropped silently.
 *
 * The first sweep then repaired exactly one row before an unrelated error
 * aborted it, which is the failure mode these tests exist to prevent: a
 * best-effort repair that quietly stops partway is worse than one that never
 * ran, because the log says it worked.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EnvelopeCryptoService } from '../src/auth/crypto/envelope-crypto.service';
import { PiiBackfillService } from '../src/modules/workers/pii-backfill.service';

const cfg = { get: () => undefined, getOrThrow: () => 'x'.repeat(32) } as never;

describe('PII backfill', () => {
  let prisma: PrismaClient;
  let crypto: EnvelopeCryptoService;
  let backfill: PiiBackfillService;
  const platformId = randomUUID();

  const plaintextPerson = async (phone: string) =>
    prisma.person.create({
      data: { platformId, phoneEnc: Buffer.from(phone, 'utf8'), fullName: 'Legacy Row' },
    });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    crypto = new EnvelopeCryptoService(cfg);
    backfill = new PiiBackfillService(prisma as never, crypto);
    await prisma.platform.create({ data: { id: platformId, name: 'PII' } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('recovers a plaintext value and flags the row as needing repair', () => {
    const r = crypto.readMaybeEncrypted(Buffer.from('+971500000001', 'utf8'));
    expect(r.value).toBe('+971500000001');
    expect(r.wasPlaintext).toBe(true);
  });

  it('reads a properly encrypted value without flagging it', () => {
    const r = crypto.readMaybeEncrypted(Buffer.from(crypto.encrypt('+971500000002')));
    expect(r.value).toBe('+971500000002');
    expect(r.wasPlaintext).toBe(false);
  });

  it('re-encrypts plaintext rows, and the value survives intact', async () => {
    const before = await plaintextPerson('+971500000003');

    const result = await backfill.run();
    expect(result.repaired).toBeGreaterThan(0);
    expect(result.failed).toBe(0);

    const after = await prisma.person.findUniqueOrThrow({ where: { id: before.id } });
    const read = crypto.readMaybeEncrypted(after.phoneEnc);
    // Now genuine ciphertext, and still the same number.
    expect(read.wasPlaintext).toBe(false);
    expect(read.value).toBe('+971500000003');
  });

  it('is idempotent — a second pass repairs nothing and breaks nothing', async () => {
    const first = await backfill.run();
    expect(first.failed).toBe(0);
    const second = await backfill.run();
    expect(second.repaired).toBe(0);
    expect(second.failed).toBe(0);
  });

  it('one unreadable row does not stop the others being repaired', async () => {
    // Bytes that are neither valid ciphertext nor printable text — the shape
    // that aborted the first sweep after a single row.
    await prisma.person.create({
      data: { platformId, phoneEnc: Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x02]), fullName: 'Corrupt' },
    });
    const good = await Promise.all([
      plaintextPerson('+971500000004'),
      plaintextPerson('+971500000005'),
      plaintextPerson('+971500000006'),
    ]);

    const result = await backfill.run();
    expect(result.repaired).toBe(3);

    for (const p of good) {
      const after = await prisma.person.findUniqueOrThrow({ where: { id: p.id } });
      expect(crypto.readMaybeEncrypted(after.phoneEnc).wasPlaintext).toBe(false);
    }
  });

  it('leaves a genuinely unreadable blob alone rather than destroying it', async () => {
    const corrupt = Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x02]);
    const p = await prisma.person.create({
      data: { platformId, phoneEnc: corrupt, fullName: 'Untouched' },
    });
    await backfill.run();
    const after = await prisma.person.findUniqueOrThrow({ where: { id: p.id } });
    // Unrecoverable is not the same as disposable — overwriting it would lose
    // whatever it is for good.
    expect(Buffer.from(after.phoneEnc!)).toEqual(corrupt);
  });
});
