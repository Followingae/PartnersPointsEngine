/**
 * Wave 1 integration: full brand-admin CRUD (update/delete/clone), the audit
 * trail, customer 360, and superadmin merchant/wallet mutations — against
 * embedded Postgres (owner connection).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../src/platform-core/audit/audit.service';
import { CampaignService } from '../src/modules/loyalty-rules/campaign.service';
import { GamificationService } from '../src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from '../src/modules/loyalty-rules/loyalty.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { SuperadminService } from '../src/modules/superadmin/superadmin.service';
import { WalletService } from '../src/modules/wallet/wallet.service';

describe('Brand-admin CRUD + audit + 360 + superadmin (Wave 1)', () => {
  let prisma: PrismaClient;
  let loyalty: LoyaltyService;
  let campaigns: CampaignService;
  let gamification: GamificationService;
  let superadmin: SuperadminService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const adminId = randomUUID();

  const ctx: TenantContext = {
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin',
    actor: { type: 'user', id: adminId, onBehalfOf: null },
  };
  const platformCtx: TenantContext = { ...ctx, brandId: null, groupId: null, scopeLevel: 'platform', surface: 'superadmin', actor: { type: 'user', id: adminId, onBehalfOf: null } };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    const audit = new AuditService();
    campaigns = new CampaignService(tenants, audit);
    gamification = new GamificationService(tenants, audit);
    loyalty = new LoyaltyService(tenants, campaigns, gamification, audit);
    superadmin = new SuperadminService(tenants, new WalletService(tenants), audit);

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.groupWallet.create({ data: { groupId, platformId, currency: 'AED' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reward lifecycle: create → list({rows,total}) → update → clone → archive', async () => {
    const created = (await loyalty.createCatalogItem(ctx, { name: 'Free Coffee', pointsCost: 200 })) as { id: string };
    const list = await loyalty.listRewards(ctx, { limit: 50 });
    expect(Array.isArray(list.rows)).toBe(true);
    expect(typeof list.total).toBe('number');
    expect(list.rows.find((r) => r.id === created.id)).toBeTruthy();

    const updated = (await loyalty.updateReward(ctx, created.id, { name: 'Free Latte', pointsCost: 250 })) as { name: string; pointsCost: string };
    expect(updated.name).toBe('Free Latte');
    expect(updated.pointsCost).toBe('250');

    const clone = (await loyalty.cloneReward(ctx, created.id)) as { id: string; name: string };
    expect(clone.name).toContain('(copy)');
    expect(clone.id).not.toBe(created.id);

    const del = (await loyalty.deleteReward(ctx, created.id)) as { archived: boolean };
    expect(del.archived).toBe(true);
    // default list excludes archived
    const after = await loyalty.listRewards(ctx, { limit: 50 });
    expect(after.rows.find((r) => r.id === created.id)).toBeFalsy();
  });

  it('tier update + delete', async () => {
    const t = (await loyalty.createTier(ctx, { name: 'Silver', threshold: 1000, multiplierBps: 12000 })) as { id: string };
    const upd = (await loyalty.updateTier(ctx, t.id, { multiplierBps: 15000 })) as { multiplierBps: number };
    expect(upd.multiplierBps).toBe(15000);
    const del = (await loyalty.deleteTier(ctx, t.id)) as { deleted: boolean };
    expect(del.deleted).toBe(true);
  });

  it('earn-rule update validates the definition via the engine', async () => {
    const r = (await loyalty.createEarnRule(ctx, { name: 'base', definition: { actions: [{ type: 'perVisit', points: 5 }] } })) as { id: string };
    await expect(loyalty.updateEarnRule(ctx, r.id, { definition: { actions: [{ type: 'nonsense' }] } })).rejects.toBeTruthy();
  });

  it('writes a tamper-evident audit row on each mutation', async () => {
    const logs = await loyalty.listAuditLogs(ctx, { limit: 100 });
    expect(logs.total).toBeGreaterThan(0);
    const actions = logs.rows.map((r) => (r as { action: string }).action);
    expect(actions).toContain('reward.create');
    expect(actions).toContain('reward.update');
    expect(actions).toContain('reward.archive');
  });

  it('customer 360 returns balance, tier and progress', async () => {
    const person = await prisma.person.create({ data: { platformId } });
    const m = await prisma.customerMembership.create({ data: { personId: person.id, brandId, groupId, platformId, loyaltyId: `L-${randomUUID().slice(0, 6)}` } });
    await loyalty.createEarnRule(ctx, { name: '1pt/AED', definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] } });
    await prisma.$transaction((tx) => loyalty.earnWithTx(tx as never, ctx, { membershipId: m.id, amountMinor: 50000, idempotencyKey: 'k1' }));

    const profile = (await loyalty.customerProfile(ctx, m.id)) as { balance: { available: string }; transactions: unknown[] };
    expect(BigInt(profile.balance.available)).toBeGreaterThan(0n);
    expect(profile.transactions.length).toBeGreaterThan(0);
  });

  it('member search + pagination return {rows,total}', async () => {
    const res = await loyalty.listMembers(ctx, { limit: 10, sort: 'lifetime', order: 'desc' });
    expect(Array.isArray(res.rows)).toBe(true);
    expect(res.total).toBeGreaterThanOrEqual(1);
  });

  it('superadmin: group detail, update, suspend/reactivate, wallet ledger', async () => {
    const detail = (await superadmin.getGroup(platformCtx, groupId)) as { id: string; wallet: { available: string }; status: string };
    expect(detail.id).toBe(groupId);

    const upd = (await superadmin.updateGroup(platformCtx, groupId, { lowBalanceThreshold: 500000 })) as { id: string };
    expect(upd.id).toBe(groupId);

    await superadmin.topUpWallet(platformCtx, groupId, 250000, 'AED', `top-${randomUUID()}`);
    const ledger = await superadmin.walletLedger(platformCtx, groupId, { limit: 10 });
    expect(ledger.total).toBeGreaterThanOrEqual(1);
    expect(ledger.rows[0]?.amount).toBe('250000');

    const sus = (await superadmin.setGroupStatus(platformCtx, groupId, 'suspended')) as { status: string };
    expect(sus.status).toBe('suspended');
    const re = (await superadmin.setGroupStatus(platformCtx, groupId, 'active')) as { status: string };
    expect(re.status).toBe('active');
  });
});
