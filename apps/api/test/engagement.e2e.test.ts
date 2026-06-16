/**
 * Phase 5 integration: campaigns, gamification (challenge → badge + bonus),
 * referrals, voucher redemption, group-wallet settlement, and webhook delivery —
 * against embedded Postgres (owner connection; RLS proven separately).
 */
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ledger, PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EnvelopeCryptoService } from '../src/auth/crypto/envelope-crypto.service';
import { AuditService } from '../src/platform-core/audit/audit.service';
import { CampaignService } from '../src/modules/loyalty-rules/campaign.service';
import { GamificationService } from '../src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from '../src/modules/loyalty-rules/loyalty.service';
import { ReferralService } from '../src/modules/loyalty-rules/referral.service';
import { SettlementService } from '../src/modules/workers/settlement.service';
import { WebhookService } from '../src/modules/workers/webhook.service';
import { OutboxService } from '../src/modules/workers/outbox.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';

const cfg = { get: () => undefined, getOrThrow: () => 'x' } as never;

describe('Engagement + workers (Phase 5)', () => {
  let prisma: PrismaClient;
  let tenants: TenantService;
  let loyalty: LoyaltyService;
  let gamification: GamificationService;
  let referral: ReferralService;
  let settlement: SettlementService;
  let webhook: WebhookService;
  let outbox: OutboxService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const adminId = randomUUID();

  const ctx: TenantContext = {
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin',
    actor: { type: 'user', id: adminId, onBehalfOf: null },
  };
  const groupCtx: TenantContext = { ...ctx, brandId: null, scopeLevel: 'group', surface: 'superadmin', actor: { type: 'system', id: adminId, onBehalfOf: null } };

  async function newMember(): Promise<string> {
    const person = await prisma.person.create({ data: { platformId } });
    const m = await prisma.customerMembership.create({ data: { personId: person.id, brandId, groupId, platformId, loyaltyId: `L-${randomUUID().slice(0, 6)}` } });
    return m.id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    tenants = new TenantService(prisma as never);
    const audit = new AuditService();
    const campaign = new CampaignService(tenants, audit);
    gamification = new GamificationService(tenants, audit);
    loyalty = new LoyaltyService(tenants, campaign, gamification, audit);
    referral = new ReferralService(tenants);
    settlement = new SettlementService(tenants);
    webhook = new WebhookService(tenants, new EnvelopeCryptoService(cfg), audit);
    outbox = new OutboxService();

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });
    await prisma.loyaltyEarnRule.create({ data: { brandId, groupId, platformId, name: '1pt/AED', definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const earn = (membershipId: string, amountMinor: number, key: string) =>
    prisma.$transaction((tx) => loyalty.earnWithTx(tx as never, ctx, { membershipId, amountMinor, idempotencyKey: key }));

  it('applies a time-boxed campaign bonus on top of base earn', async () => {
    const m = await newMember();
    await prisma.campaign.create({ data: { brandId, groupId, platformId, name: 'spend bonus', definition: { condition: { attr: 'session.amountMinor', op: 'gte', value: 10000 }, actions: [{ type: 'bonus', points: 50 }] } } });
    const r = await earn(m, 10000, 'c1');
    expect(r.balance?.available).toBe('150'); // 100 base + 50 campaign
  });

  it('awards a badge + bonus when a challenge threshold is crossed', async () => {
    const m = await newMember();
    const badge = await gamification.createBadge(ctx, { name: `VIP-${m.slice(0, 6)}`, rewardPoints: 25 });
    await gamification.createChallenge(ctx, { name: `reach100-${m.slice(0, 6)}`, target: 100, badgeId: badge.id });
    await earn(m, 10000, 'g1'); // 100 base earn → crosses 100 → badge (+25 bonus)
    const badges = await gamification.badges(ctx, m);
    expect(badges.length).toBe(1);
    const bal = await loyalty.balance(ctx, m);
    expect(BigInt(bal.available)).toBeGreaterThanOrEqual(125n); // 100 + 25 (campaign from prior test may also apply: +50)
  });

  it('rewards both parties on referral redemption', async () => {
    const referrer = await newMember();
    const referee = await newMember();
    const { code } = await referral.getOrCreateCode(ctx, referrer);
    const res = await referral.redeem(ctx, code, referee);
    expect(res.status).toBe('rewarded');
    const refBal = await loyalty.balance(ctx, referrer);
    const reeBal = await loyalty.balance(ctx, referee);
    expect(refBal.available).toBe('100');
    expect(reeBal.available).toBe('50');
  });

  it('redeems a reward into a voucher, then marks the voucher used', async () => {
    const m = await newMember();
    await earn(m, 100000, 'v-earn'); // 1000 pts
    const item = await loyalty.createCatalogItem(ctx, { name: 'Free Coffee', pointsCost: 300 });
    const { voucher } = await loyalty.redeem(ctx, m, item.id, 'v-redeem');
    expect(voucher.status).toBe('issued');
    const used = await loyalty.redeemVoucher(ctx, voucher.code, m);
    expect(used.status).toBe('redeemed');
  });

  it('settles a captured POS redemption against the group wallet', async () => {
    const m = await newMember();
    await earn(m, 100000, 's-earn'); // 1000 pts
    // Fund wallet + cost rule (100 fils/pt, 10% margin).
    await prisma.$transaction((tx) => ledger.topUpWallet(tx as never, { scope: { platformId, groupId, brandId: null }, currency: 'AED', amountMinor: 1_000_000n, occurredAt: new Date(), idem: { actorId: adminId, key: 'wfund' } }));
    await prisma.groupWallet.create({ data: { groupId, platformId, currency: 'AED' } });
    await prisma.costRule.create({ data: { groupId, platformId, costPerPointMinor: 100n, platformMarginBps: 1000 } });
    // A captured redeem of 200 pts (authorize+capture via ledger, then record the terminal txn).
    await prisma.$transaction(async (tx) => {
      await ledger.authorizeRedeem(tx as never, { scope: { platformId, groupId, brandId, customerId: m }, points: 200n, occurredAt: new Date(), idem: { actorId: adminId, key: 'pr-a' } });
      await ledger.captureRedeem(tx as never, { scope: { platformId, groupId, brandId, customerId: m }, points: 200n, occurredAt: new Date(), idem: { actorId: adminId, key: 'pr-c' } });
    });
    const txn = await prisma.terminalTransaction.create({ data: { brandId, groupId, platformId, actorId: adminId, intent: 'redeem', state: 'captured', points: 200n, membershipId: m, idempotencyKey: `pos-${randomUUID().slice(0, 8)}` } });

    const res = await settlement.settleGroup(groupCtx);
    expect(res.settled).toBeGreaterThanOrEqual(1);

    const walletAcc = await prisma.$transaction((tx) =>
      ledger.getOrCreateAccount(tx as never, { ledger: 'wallet', accountType: 'wallet_liability', normalSide: 'credit', assetCode: 'AED', platformId, groupId, brandId: null }),
    );
    const bal = await prisma.$transaction((tx) => ledger.getBalance(tx as never, walletAcc.id));
    // 200 pts * 100 fils + 10% = 22000 drawn from 1,000,000.
    expect(bal.available).toBe(978000n);
    const settled = await prisma.terminalTransaction.findUnique({ where: { id: txn.id } });
    expect(settled?.settledAt).not.toBeNull();
  });

  it('relays the outbox and delivers a signed webhook', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    webhook.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) });
      return new Response('ok', { status: 200 });
    }) as never;

    await webhook.createEndpoint(ctx, 'https://example.test/hook', ['*'], 'whsec_123');
    await prisma.$transaction((tx) => outbox.emit(tx as never, ctx, 'points', 'points_earned', { membershipId: 'm1', points: 100 }));

    const relayed = await webhook.relayOutbox(ctx);
    expect(relayed.relayed).toBe(1);
    const delivered = await webhook.deliverPending(ctx);
    expect(delivered.delivered).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers['X-Loyalty-Signature']).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
  });
});
