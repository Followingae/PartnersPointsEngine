/**
 * Post-transaction alerts.
 *
 * The thing worth proving is the delivery guarantee. A message after every
 * transaction is only acceptable if it is genuinely *every* transaction and
 * genuinely *once* — a customer messaged twice for one coffee will opt out, and
 * a till that retries must not cost them that.
 */
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EnvelopeCryptoService } from '../src/auth/crypto/envelope-crypto.service';
import { TokenService } from '../src/auth/tokens/token.service';
import { CampaignService } from '../src/modules/loyalty-rules/campaign.service';
import { GamificationService } from '../src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from '../src/modules/loyalty-rules/loyalty.service';
import { TerminalService } from '../src/modules/terminal-gateway/terminal.service';
import { OutboxService } from '../src/modules/workers/outbox.service';
import { AuditService } from '../src/platform-core/audit/audit.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';

const sha256 = (v: string) => require('node:crypto').createHash('sha256').update(v).digest('hex');

const fakeConfig = {
  get: (k: string) => ({ JWT_ACCESS_TTL_SECONDS: 900 })[k as 'JWT_ACCESS_TTL_SECONDS'],
  getOrThrow: (k: string) =>
    ({ JWT_ACCESS_SECRET: 'test-access-secret-0123456789', JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789' })[
      k as 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'
    ],
} as never;

describe('Transaction alerts', () => {
  let prisma: PrismaClient;
  let terminal: TerminalService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const branchId = randomUUID();
  const terminalId = randomUUID();
  const phone = '+971500123456';
  let membershipId: string;
  let personId: string;

  const ctx: TenantContext = {
    platformId, groupId, brandId, branchId, scopeLevel: 'brand', surface: 'terminal',
    actor: { type: 'terminal', id: terminalId, onBehalfOf: null },
  };

  const alertEvents = () =>
    prisma.outbox.findMany({ where: { aggregate: 'points', brandId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    const audit = new AuditService();
    const crypto = new EnvelopeCryptoService(fakeConfig);
    const loyalty = new LoyaltyService(
      tenants, new CampaignService(tenants, audit), new GamificationService(tenants, audit), audit,
    );
    terminal = new TerminalService(
      tenants, new TokenService(new JwtService({}), fakeConfig), loyalty, crypto,
      undefined, new OutboxService(),
    );

    await prisma.platform.create({ data: { id: platformId, name: 'A' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'Alerts Cafe', slug: `a-${brandId.slice(0, 8)}` } });
    await prisma.branch.create({ data: { id: branchId, brandId, groupId, platformId, name: 'Br' } });
    await prisma.loyaltyEarnRule.create({
      data: {
        brandId, groupId, platformId, name: '1pt/AED', priority: 0, enabled: true,
        definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] },
      },
    });

    const person = await prisma.person.create({
      data: { platformId, phoneHash: sha256(phone), phoneEnc: Buffer.from(crypto.encrypt(phone)), fullName: 'Alert Tester' },
    });
    personId = person.id;
    const m = await prisma.customerMembership.create({
      data: { personId, brandId, groupId, platformId, loyaltyId: `AL-${randomUUID().slice(0, 6)}` },
    });
    membershipId = m.id;
    await prisma.customerIdentifier.create({
      data: { membershipId: m.id, brandId, groupId, platformId, type: 'phone', valueHash: sha256(phone) },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('emits one alert event per earn', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    await terminal.transaction(ctx, {
      intent: 'earn', memberToken, idempotencyKey: `k-${randomUUID()}`, amountMinor: 4200,
    });

    const events = await alertEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('points.earned');
    const payload = events[0]!.payload as { membershipId: string; points: string };
    expect(payload.membershipId).toBe(membershipId);
    expect(payload.points).toBe('42');
  });

  it('a replayed earn emits nothing — the customer is not messaged twice', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const key = `replay-${randomUUID()}`;

    await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: key, amountMinor: 1000 });
    const afterFirst = (await alertEvents()).length;

    // The till retries — same idempotency key, e.g. a lost response.
    await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: key, amountMinor: 1000 });
    expect((await alertEvents()).length).toBe(afterFirst);
  });

  it('emits on redemption capture, but not on the authorization', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const before = (await alertEvents()).length;

    const auth = await terminal.transaction(ctx, {
      intent: 'redeem', memberToken, idempotencyKey: `r-${randomUUID()}`, points: 10,
    });
    // Authorizing is a hold, not a spend — nothing has happened worth telling
    // the customer about yet.
    expect((await alertEvents()).length).toBe(before);

    await terminal.capture(ctx, auth.id);
    const events = await alertEvents();
    expect(events.length).toBe(before + 1);
    expect(events.at(-1)!.eventType).toBe('points.redeemed');
  });

  it('a voided redemption never reports a spend', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const before = (await alertEvents()).length;

    const auth = await terminal.transaction(ctx, {
      intent: 'redeem', memberToken, idempotencyKey: `v-${randomUUID()}`, points: 5,
    });
    await terminal.voidTxn(ctx, auth.id);

    expect((await alertEvents()).length).toBe(before);
  });

  it('two relays running at once never claim the same event', async () => {
    const { PrismaService } = await import('../src/platform-core/prisma/prisma.service');
    const { TxnAlertService } = await import('../src/modules/workers/txn-alert.service');
    const { EnvelopeCryptoService } = await import('../src/auth/crypto/envelope-crypto.service');

    // Count what each relay claims rather than what it sends — no provider is
    // configured here, so nothing actually leaves the process.
    const claimed: string[] = [];
    const build = () => {
      const svc = new TxnAlertService(
        prisma as never,
        { sendTemplate: async () => ({ delivered: false }) } as never,
        new EnvelopeCryptoService(fakeConfig),
        { get: () => undefined } as never,
      );
      const original = (svc as never as { handle: (t: string, p: Record<string, unknown>) => Promise<boolean> }).handle;
      (svc as never as Record<string, unknown>).handle = async (t: string, p: Record<string, unknown>) => {
        claimed.push(String(p.transactionId ?? ''));
        return original.call(svc, t, p);
      };
      return svc;
    };
    void PrismaService;

    const pending = await prisma.outbox.count({ where: { publishedAt: null, aggregate: 'points', brandId } });
    expect(pending).toBeGreaterThan(0);

    // The API runs two instances, so this is the real race, not a hypothetical.
    await Promise.all([build().relay(), build().relay()]);

    const unique = new Set(claimed);
    expect(claimed.length).toBe(unique.size);
    expect(await prisma.outbox.count({ where: { publishedAt: null, aggregate: 'points', brandId } })).toBe(0);
  });

  /** The latest earn for this member — the alert context is keyed by transaction. */
  const latestEarn = async () => {
    const t = await prisma.terminalTransaction.findFirst({
      where: { membershipId, intent: 'earn' },
      orderBy: { createdAt: 'desc' },
    });
    return t!.id;
  };

  describe('one sale, one message', () => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 7, 3, 12, 0, seconds));
    const ev = (type: string, seconds: number, payload: Record<string, unknown>) => ({
      id: `o-${type}-${seconds}`,
      event_type: type,
      created_at: at(seconds),
      payload: { membershipId: 'm1', transactionId: `t-${seconds}`, ...payload },
    });

    it('merges an earn and a redemption from the same purchase', async () => {
      const { groupBySale } = await import('../src/modules/workers/txn-alert.service');
      // What a redeem-and-earn sale actually writes: two events, seconds apart.
      const sales = groupBySale([
        ev('points.redeemed', 0, { points: '500', rewardName: 'Free coffee' }),
        ev('points.earned', 2, { points: '42' }),
      ]);

      expect(sales).toHaveLength(1);
      expect(sales[0]!.earnedPoints).toBe('42');
      expect(sales[0]!.redeemedReward).toBe('Free coffee');
      // Anchored on the redemption — that's the transaction the receipt is
      // written against.
      expect(sales[0]!.anchorTransactionId).toBe('t-0');
    });

    it('keeps two genuinely separate visits apart', async () => {
      const { groupBySale } = await import('../src/modules/workers/txn-alert.service');
      const sales = groupBySale([
        ev('points.earned', 0, { points: '10' }),
        ev('points.earned', 600, { points: '20' }), // ten minutes later
      ]);
      expect(sales).toHaveLength(2);
    });

    it('never merges two different customers', async () => {
      const { groupBySale } = await import('../src/modules/workers/txn-alert.service');
      const sales = groupBySale([
        ev('points.earned', 0, { points: '10' }),
        { ...ev('points.earned', 1, { points: '20' }), payload: { membershipId: 'm2', transactionId: 't-x', points: '20' } },
      ]);
      expect(sales).toHaveLength(2);
    });

    it('ignores a zero-point earn — nothing worth saying', async () => {
      const { groupBySale } = await import('../src/modules/workers/txn-alert.service');
      const sales = groupBySale([ev('points.earned', 0, { points: '0' })]);
      expect(sales[0]!.earnedPoints).toBeNull();
    });

    it('does not fold an adjustment into a sale', async () => {
      const { groupBySale } = await import('../src/modules/workers/txn-alert.service');
      // An adjustment apologises for a missed visit; it isn't part of a purchase.
      const sales = groupBySale([
        ev('points.earned', 0, { points: '10' }),
        ev('points.adjusted', 1, { points: '50' }),
      ]);
      expect(sales[0]!.adjustedPoints).toBe('50');
    });
  });

  it('the alert context carries everything the message needs', async () => {
    const id = await latestEarn();
    const rows = await prisma.$queryRaw<{ ctx: AlertCtx | null }[]>`
      SELECT txn_alert_context(${id}) AS ctx`;
    const who = rows[0]!.ctx!;
    expect(who.firstName).toBe('Alert');
    expect(who.brandName).toBe('Alerts Cafe');
    // Every table this reads is under tenant RLS, and the relay has no tenant —
    // a direct select returns nothing, which is what silently held every alert.
    expect(who.phoneEnc).not.toBeNull();
  });

  it('an opted-out customer is not a recipient at all', async () => {
    const id = await latestEarn();
    await prisma.person.update({ where: { id: personId }, data: { txnAlertsOptOut: true } });
    const rows = await prisma.$queryRaw<{ ctx: AlertCtx | null }[]>`
      SELECT txn_alert_context(${id}) AS ctx`;
    // Consent is enforced at the source, so no caller can message them by mistake.
    expect(rows[0]!.ctx).toBeNull();
    await prisma.person.update({ where: { id: personId }, data: { txnAlertsOptOut: false } });
  });

  it('a customer with no phone on file is not a recipient', async () => {
    const id = await latestEarn();
    const saved = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
    await prisma.person.update({ where: { id: personId }, data: { phoneEnc: null } });
    const rows = await prisma.$queryRaw<{ ctx: AlertCtx | null }[]>`
      SELECT txn_alert_context(${id}) AS ctx`;
    expect(rows[0]!.ctx).toBeNull();
    await prisma.person.update({ where: { id: personId }, data: { phoneEnc: saved.phoneEnc } });
  });

});

interface AlertCtx {
  firstName: string;
  brandName: string;
  phoneEnc: string | null;
  priorEarns: number;
  receiptToken: string | null;
}
