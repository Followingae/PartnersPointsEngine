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

  describe('Twilio delivery', () => {
    const env: Record<string, string> = {
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC_test_account',
      TWILIO_API_KEY_SID: 'SK_test_key',
      TWILIO_API_KEY_SECRET: 'secret_value',
      TWILIO_FROM: '+971509169764',
    };
    const cfg = {
      get: (k: string) => env[k],
      getOrThrow: (k: string) => {
        const v = env[k];
        if (!v) throw new Error(`missing ${k}`);
        return v;
      },
    } as never;

    it('posts to the account’s Messages endpoint with the key as basic auth', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const original = globalThis.fetch;
      globalThis.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return { ok: true, status: 201, text: async () => '{}' } as Response;
      }) as never;

      try {
        const sender = new SmsSenderService(cfg);
        expect(sender.configured).toBe(true);
        const r = await sender.sendCode('+971500000000', '123456');
        expect(r.delivered).toBe(true);

        const [call] = calls;
        expect(call!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test_account/Messages.json');

        const auth = (call!.init.headers as Record<string, string>).Authorization!;
        const [scheme, encoded] = auth.split(' ');
        expect(scheme).toBe('Basic');
        expect(Buffer.from(encoded!, 'base64').toString()).toBe('SK_test_key:secret_value');

        const body = new URLSearchParams(call!.init.body as string);
        expect(body.get('To')).toBe('+971500000000');
        expect(body.get('From')).toBe('+971509169764');
        expect(body.get('Body')).toContain('123456');
      } finally {
        globalThis.fetch = original;
      }
    });

    it('sends over WhatsApp through the approved template, not as free text', async () => {
      const waEnv = {
        ...env,
        TWILIO_CHANNEL: 'whatsapp',
        TWILIO_CONTENT_SID: 'HX_auth_template',
      };
      const waCfg = {
        get: (k: string) => waEnv[k as keyof typeof waEnv],
        getOrThrow: (k: string) => waEnv[k as keyof typeof waEnv]!,
      } as never;

      let captured: RequestInit | undefined;
      const original = globalThis.fetch;
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        captured = init;
        return { ok: true, status: 201, text: async () => '{}' } as Response;
      }) as never;

      try {
        await new SmsSenderService(waCfg).sendCode('+971509169764', '654321');
        const body = new URLSearchParams(captured!.body as string);
        // Both ends have to carry the whatsapp: prefix or Twilio treats it as SMS.
        expect(body.get('To')).toBe('whatsapp:+971509169764');
        expect(body.get('From')).toBe('whatsapp:+971509169764');
        expect(body.get('ContentSid')).toBe('HX_auth_template');
        expect(JSON.parse(body.get('ContentVariables')!)).toEqual({ '1': '654321' });
        // WhatsApp rejects a business-initiated message that carries free text.
        expect(body.get('Body')).toBeNull();
      } finally {
        globalThis.fetch = original;
      }
    });

    it('reports a rejected send rather than pretending it went', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = (async () =>
        ({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ message: 'Unverified number', code: 21608 }),
        }) as Response) as never;
      try {
        const r = await new SmsSenderService(cfg).sendCode('+971500000000', '123456');
        expect(r.delivered).toBe(false);
      } finally {
        globalThis.fetch = original;
      }
    });

    it('is not configured when the credentials are incomplete', () => {
      const partial = { ...env };
      delete partial.TWILIO_API_KEY_SECRET;
      const sender = new SmsSenderService({
        get: (k: string) => partial[k],
        getOrThrow: (k: string) => partial[k]!,
      } as never);
      // Half-configured must read as off, or codes vanish silently.
      expect(sender.configured).toBe(false);
    });
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
