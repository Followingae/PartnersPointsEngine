/**
 * Sign-in codes.
 *
 * These previously lived in a per-instance Map and were only ever written to
 * the log, so the two things worth proving are that a code survives being
 * issued and verified through the database, and that the endpoint can't be used
 * to text a number repeatedly or to brute-force a code.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OtpStoreService } from '../src/auth/otp/otp-store.service';
import { SmsSenderService } from '../src/auth/otp/sms-sender.service';

/** Captures what would have been sent, so tests can read the code. */
class CapturingSms extends SmsSenderService {
  sent: Array<{ phone: string; code: string }> = [];
  constructor() {
    super({ get: () => undefined, getOrThrow: () => '' } as never);
  }
  override async sendCode(phone: string, code: string) {
    this.sent.push({ phone, code });
    return { delivered: true };
  }
  last(): string {
    return this.sent[this.sent.length - 1]!.code;
  }
}

describe('Phone sign-in codes', () => {
  let prisma: PrismaClient;
  let sms: CapturingSms;
  let otp: OtpStoreService;

  const phone = () => `+9715${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    sms = new CapturingSms();
    otp = new OtpStoreService(prisma as never, sms);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('issues a code, sends it, and verifies it', async () => {
    const p = phone();
    const r = await otp.issue(p);
    expect(r.sent).toBe(true);
    expect(sms.sent.at(-1)!.phone).toBe(p);
    expect(await otp.verify(p, sms.last())).toBe(true);
  });

  it('stores only the hash — the code itself is never persisted', async () => {
    const p = phone();
    await otp.issue(p);
    const code = sms.last();
    const rows = await prisma.$queryRaw<{ code_hash: string }[]>`
      SELECT code_hash FROM otp_code`;
    expect(rows.every((r) => r.code_hash !== code)).toBe(true);
  });

  it('consumes the code: the same one cannot be used twice', async () => {
    const p = phone();
    await otp.issue(p);
    const code = sms.last();
    expect(await otp.verify(p, code)).toBe(true);
    expect(await otp.verify(p, code)).toBe(false);
  });

  it('rejects a wrong code, and dies after five wrong guesses', async () => {
    const p = phone();
    await otp.issue(p);
    const code = sms.last();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      expect(await otp.verify(p, wrong)).toBe(false);
    }
    // Burnt through the attempts — even the right code is now dead.
    expect(await otp.verify(p, code)).toBe(false);
  });

  it('rate-limits repeated sends to one number', async () => {
    const p = phone();
    for (let i = 0; i < 5; i++) {
      expect((await otp.issue(p)).sent).toBe(true);
    }
    const sixth = await otp.issue(p);
    expect(sixth.sent).toBe(false);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('re-issuing replaces the previous code rather than accepting both', async () => {
    const p = phone();
    await otp.issue(p);
    const first = sms.last();
    await otp.issue(p);
    const second = sms.last();
    expect(first).not.toBe(second);
    expect(await otp.verify(p, first)).toBe(false);
    expect(await otp.verify(p, second)).toBe(true);
  });

  it('an expired code does not verify', async () => {
    const p = phone();
    await otp.issue(p);
    const code = sms.last();
    await prisma.$executeRaw`UPDATE otp_code SET expires_at = now() - interval '1 minute'`;
    expect(await otp.verify(p, code)).toBe(false);
  });

  it('reports that nothing was delivered when no provider is configured', async () => {
    const bare = new SmsSenderService({ get: () => undefined, getOrThrow: () => '' } as never);
    expect(bare.configured).toBe(false);
    const store = new OtpStoreService(prisma as never, bare);
    const r = await store.issue(phone());
    // The code was issued and stored, but nobody received it — the caller must
    // be able to tell those apart.
    expect(r.sent).toBe(true);
    expect(r.delivered).toBe(false);
  });
});
