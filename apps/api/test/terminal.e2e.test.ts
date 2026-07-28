/**
 * Phase 4 integration: drive the TerminalService (resolve → earn → redeem
 * authorize → capture, idempotent replay, offline batch) against embedded
 * Postgres. Services are instantiated directly (no Nest DI); the owner connection
 * bypasses RLS so we exercise the transaction state machine + ledger composition.
 */
import { createHash, randomUUID } from 'node:crypto';
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
import { AuditService } from '../src/platform-core/audit/audit.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { TerminalService } from '../src/modules/terminal-gateway/terminal.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const fakeConfig = {
  get: (k: string) => ({ JWT_ACCESS_TTL_SECONDS: 900 })[k as 'JWT_ACCESS_TTL_SECONDS'],
  getOrThrow: (k: string) =>
    ({ JWT_ACCESS_SECRET: 'test-access-secret-0123456789', JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789' })[
      k as 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'
    ],
} as never;

describe('Terminal gateway (Phase 4)', () => {
  let prisma: PrismaClient;
  let terminal: TerminalService;
  let loyalty: LoyaltyService;
  let gamification: GamificationService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const branchId = randomUUID();
  const terminalId = randomUUID();
  const phone = '+971500000999';
  let membershipId: string;

  const ctx: TenantContext = {
    platformId,
    groupId,
    brandId,
    branchId,
    scopeLevel: 'brand',
    surface: 'terminal',
    actor: { type: 'terminal', id: terminalId, onBehalfOf: null },
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    const audit = new AuditService();
    const tokens = new TokenService(new JwtService({}), fakeConfig);
    gamification = new GamificationService(tenants, audit);
    loyalty = new LoyaltyService(tenants, new CampaignService(tenants, audit), gamification, audit);
    const crypto = new EnvelopeCryptoService(fakeConfig);
    terminal = new TerminalService(tenants, tokens, loyalty, crypto);

    // Seed tenancy + member + identifier + an earn rule (as owner; RLS bypassed).
    await prisma.platform.create({ data: { id: platformId, name: 'T' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });
    await prisma.branch.create({ data: { id: branchId, brandId, groupId, platformId, name: 'Br' } });
    const person = await prisma.person.create({ data: { platformId, phoneHash: sha256(phone) } });
    const m = await prisma.customerMembership.create({
      data: { personId: person.id, brandId, groupId, platformId, loyaltyId: 'M-1' },
    });
    membershipId = m.id;
    await prisma.customerIdentifier.create({
      data: { membershipId: m.id, brandId, groupId, platformId, type: 'phone', valueHash: sha256(phone) },
    });
    await prisma.loyaltyEarnRule.create({
      data: { brandId, groupId, platformId, name: '1pt/AED', priority: 0, enabled: true, definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolves an identifier to a member token', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    expect(typeof memberToken).toBe('string');
  });

  it('serves terminal boot config with the brand redemption valuation', async () => {
    await prisma.redemptionConfig.create({
      data: { brandId, groupId, platformId, ratePoints: 100n, rateValueMinor: 100n, minRedeemPoints: 200n, maxPercentOfBillBps: 5000, roundToMinor: 25, presetsPoints: [500, 1000] },
    });
    const cfg = await terminal.config(ctx);
    expect(cfg.brand.name).toBe('B');
    expect(cfg.redemption.configured).toBe(true);
    expect(cfg.redemption.ratePoints).toBe('100');
    expect(cfg.redemption.presetsPoints).toEqual([500, 1000]);
  });

  it('quotes redemption value in money, capped and rounded per config', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    // bill AED 20.00; 550 pts @ 100pts=AED1 → AED 5.50 → rounded down to 25-fils step = 5.50; cap 50% = 10.00
    const q = await terminal.quote(ctx, { memberToken, amountMinor: 2000, redeemPoints: 550 });
    expect(q.redeem?.valueMinor).toBe('550');
    expect(q.redeem?.belowMinimum).toBe(false);
    // 130 pts → AED 1.30 → rounds down to 1.25; below the 200-pt minimum
    const q2 = await terminal.quote(ctx, { memberToken, amountMinor: 2000, redeemPoints: 130 });
    expect(q2.redeem?.valueMinor).toBe('125');
    expect(q2.redeem?.belowMinimum).toBe(true);
    // huge redeem vs small bill: cap at 50% of AED 2.00 = 100 fils
    const q3 = await terminal.quote(ctx, { memberToken, amountMinor: 200, redeemPoints: 10000 });
    expect(q3.redeem?.valueMinor).toBe('100');
  });

  it('enrolls a new phone at the till and resolves it afterwards', async () => {
    const newPhone = '+971500778899';
    const first = await terminal.enroll(ctx, { phone: newPhone, fullName: 'Walk In' });
    expect(first.created).toBe(true);
    expect(typeof first.memberToken).toBe('string');
    // idempotent: enrolling again just resolves
    const again = await terminal.enroll(ctx, { phone: newPhone });
    expect(again.created).toBe(false);
    const snapshot = await terminal.memberContext(ctx, again.memberToken);
    expect(snapshot.displayName).toBe('Walk In');
  });

  it('persists an eReceipt idempotently by token', async () => {
    const token = randomUUID();
    const dto = { token, orderNo: 'RFM123456', grossMinor: 2000, discountMinor: 100, netMinor: 1900, memberName: 'Walk In', earnedPoints: 19 };
    const a = await terminal.createReceipt(ctx, dto);
    const b = await terminal.createReceipt(ctx, dto);
    expect(a.id).toBe(b.id);
    const row = await prisma.receipt.findUnique({ where: { token } });
    expect(row?.brandName).toBe('B');
    expect(row?.netMinor).toBe(1900n);
  });

  it('fills a stamp card across visits, issues a voucher, and rolls over', async () => {
    const item = await prisma.rewardCatalogItem.create({
      data: { brandId, groupId, platformId, name: 'Free coffee', pointsCost: 0n, kind: 'free_item' },
    });
    const stamp = await prisma.challenge.create({
      data: {
        brandId, groupId, platformId, name: 'Coffee card', kind: 'visits',
        target: 3n, repeatable: true, rewardItemId: item.id, enabled: true,
      },
    });
    // its own member, so the shared balance assertions stay untouched
    const { memberToken } = await terminal.enroll(ctx, { phone: '+971500111222', fullName: 'Stamp Tester' });

    // two visits — card not full yet
    for (let i = 0; i < 2; i++) {
      await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: `stamp-${i}`, amountMinor: 1000, isVisit: true });
    }
    let progress = await prisma.challengeProgress.findFirstOrThrow({ where: { challengeId: stamp.id } });
    expect(progress.progress).toBe(2n);
    expect(progress.completions).toBe(0);

    // third visit fills it: voucher issued, card rolls back to zero
    const third = await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: 'stamp-2', amountMinor: 1000, isVisit: true }) as {
      completed: Array<{ name: string; voucherCode: string | null }>; stamps: Array<{ progress: number; target: number }>;
    };
    expect(third.completed.map((c) => c.name)).toContain('Coffee card');
    const code = third.completed.find((c) => c.name === 'Coffee card')?.voucherCode;
    expect(code).toBeTruthy();
    progress = await prisma.challengeProgress.findFirstOrThrow({ where: { challengeId: stamp.id } });
    expect(progress.progress).toBe(0n);
    expect(progress.completions).toBe(1);
    expect(third.stamps.find((s) => s.target === 3)?.progress).toBe(0);

    // the till holds that voucher against the sale, once
    const redeemed = await terminal.redeemVoucher(ctx, code!.toLowerCase());
    expect(redeemed.status).toBe('reserved');
    expect(redeemed.rewardName).toBe('Free coffee');
    await expect(terminal.redeemVoucher(ctx, code!)).rejects.toThrow(/already used/);

    // Applying a reward must not spend it — it is only spent when a sale
    // captures. Before this, backing out of the sale destroyed the reward.
    const held = await prisma.voucher.findFirstOrThrow({ where: { code: code! } });
    expect(held.status).toBe('reserved');
    expect(held.redeemedAt).toBeNull();

    // The customer app draws this as a stamp card, so it has to be able to see
    // where the card has got to — and that a previous one was filled.
    // The stamp tester, not the shared member this suite otherwise uses.
    const mine = await gamification.memberChallenges(ctx, progress.membershipId);
    const card = mine.find((c) => c.id === stamp.id)!;
    expect(card.isStampCard).toBe(true);
    expect(card.target).toBe('3');
    expect(card.completions).toBe(1);
    expect(card.rewardName).toBe('Free coffee');

    // Rewards never stack: a second one can't join the same bill.
    const second = await prisma.voucher.create({
      data: {
        brandId: held.brandId,
        groupId: held.groupId,
        platformId: held.platformId,
        catalogItemId: held.catalogItemId,
        membershipId: held.membershipId,
        code: 'STACKTEST01',
        pointsSpent: 0n,
      },
    });
    await expect(terminal.redeemVoucher(ctx, second.code)).rejects.toThrow(/only one reward/i);
    await prisma.voucher.delete({ where: { id: second.id } });

    await prisma.challenge.update({ where: { id: stamp.id }, data: { enabled: false } });
  });

  it('returns a member snapshot for the cashier screen', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const snapshot = await terminal.memberContext(ctx, memberToken);
    expect(snapshot.loyaltyId).toBe('M-1');
    expect(snapshot.displayName).toBe('Member'); // no fullName on the seeded person
    expect(typeof snapshot.balance.available).toBe('string');
  });

  it('earns at the POS (single-step capture) and reflects the balance', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const txn = await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: 'pos-earn-1', amountMinor: 10000 });
    expect(txn.state).toBe('captured');
    expect(txn.points).toBe('100');
    const bal = await loyalty.balance(ctx, membershipId);
    expect(bal.available).toBe('100');
  });

  it('is idempotent: replaying an earn returns the same transaction', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const a = await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: 'pos-earn-dup', amountMinor: 5000 });
    const b = await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: 'pos-earn-dup', amountMinor: 5000 });
    expect(b.id).toBe(a.id);
    const bal = await loyalty.balance(ctx, membershipId);
    expect(bal.available).toBe('150'); // 100 + 50 (dup applied once)
  });

  it('redeems via authorize → capture', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const auth = await terminal.transaction(ctx, { intent: 'redeem', memberToken, idempotencyKey: 'pos-redeem-1', points: 40 });
    expect(auth.state).toBe('authorized');
    const cap = await terminal.capture(ctx, auth.id);
    expect(cap.state).toBe('captured');
    const bal = await loyalty.balance(ctx, membershipId);
    expect(bal.available).toBe('110'); // 150 - 40
  });

  it('replays an offline batch, deduping by idempotency key', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const ops = [
      { intent: 'earn' as const, memberToken, idempotencyKey: 'batch-1', amountMinor: 2000 },
      { intent: 'earn' as const, memberToken, idempotencyKey: 'batch-1', amountMinor: 2000 }, // dup
    ];
    const r1 = await terminal.batch(ctx, ops);
    expect(r1.results.every((x) => x.ok)).toBe(true);
    const bal = await loyalty.balance(ctx, membershipId);
    expect(bal.available).toBe('130'); // 110 + 20 (batch dup applied once)
  });
});
