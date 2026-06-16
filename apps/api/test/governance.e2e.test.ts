/**
 * W2 governance (maker-checker): mode resolution (brand default + per-capability
 * override), change-request submission (no direct mutation), approve-applies,
 * reject/withdraw, and RLS isolation of change requests across brands.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../src/platform-core/audit/audit.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { CampaignService } from '../src/modules/loyalty-rules/campaign.service';
import { GamificationService } from '../src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from '../src/modules/loyalty-rules/loyalty.service';
import { LoyaltyAppliers } from '../src/modules/loyalty-rules/loyalty.appliers';
import { AppliersRegistry } from '../src/modules/governance/appliers.registry';
import { GovernanceService } from '../src/modules/governance/governance.service';
import { OutboxService } from '../src/modules/workers/outbox.service';

describe('Governance / maker-checker (W2)', () => {
  let prisma: PrismaClient;
  let loyalty: LoyaltyService;
  let governance: GovernanceService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const brandBId = randomUUID();
  const adminId = randomUUID();
  const saId = randomUUID();

  const brandCtx: TenantContext = {
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin',
    actor: { type: 'user', id: adminId, onBehalfOf: null },
  };
  const brandBCtx: TenantContext = { ...brandCtx, brandId: brandBId };
  const platformCtx: TenantContext = { ...brandCtx, brandId: null, scopeLevel: 'platform', surface: 'superadmin', actor: { type: 'user', id: saId, onBehalfOf: null } };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    const audit = new AuditService();
    const outbox = new OutboxService();
    const campaigns = new CampaignService(tenants, audit);
    const gamification = new GamificationService(tenants, audit);
    loyalty = new LoyaltyService(tenants, campaigns, gamification, audit);
    const registry = new AppliersRegistry();
    new LoyaltyAppliers(registry, loyalty, campaigns, gamification).onModuleInit();
    governance = new GovernanceService(tenants, audit, outbox, registry);

    await prisma.platform.create({ data: { id: platformId, name: 'P' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });
    await prisma.brand.create({ data: { id: brandBId, groupId, platformId, name: 'B2', slug: `b2-${brandBId.slice(0, 8)}` } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('defaults to autonomous; per-capability override resolves first', async () => {
    expect(await governance.resolveMode(brandCtx, 'reward')).toBe('autonomous');
    await prisma.brand.update({ where: { id: brandId }, data: { governanceMode: 'approval_required' } });
    expect(await governance.resolveMode(brandCtx, 'reward')).toBe('approval_required');
    // override reward back to autonomous while brand default stays approval_required
    await governance.setBrandGovernance(platformCtx, brandId, { overrides: [{ entityType: 'reward', mode: 'autonomous' }] });
    expect(await governance.resolveMode(brandCtx, 'reward')).toBe('autonomous');
    expect(await governance.resolveMode(brandCtx, 'tier')).toBe('approval_required');
    // remove override
    await governance.setBrandGovernance(platformCtx, brandId, { overrides: [{ entityType: 'reward', mode: 'inherit' }] });
    expect(await governance.resolveMode(brandCtx, 'reward')).toBe('approval_required');
  });

  it('submit enqueues a change request WITHOUT mutating; approve applies it', async () => {
    const reward = (await loyalty.createCatalogItem(brandCtx, { name: 'Cup', pointsCost: 100 })) as { id: string };
    const cr = (await governance.submit(brandCtx, { entityType: 'reward', action: 'update', entityId: reward.id, payload: { pointsCost: 777 } })) as { id: string; status: string };
    expect(cr.status).toBe('pending');

    // not applied yet
    const before = (await loyalty.getReward(brandCtx, reward.id)) as { pointsCost: string };
    expect(before.pointsCost).toBe('100');

    await governance.approve(platformCtx, cr.id);
    const after = (await loyalty.getReward(brandCtx, reward.id)) as { pointsCost: string };
    expect(after.pointsCost).toBe('777');

    const stored = await prisma.changeRequest.findUnique({ where: { id: cr.id } });
    expect(stored?.status).toBe('approved');
    expect(stored?.appliedEntityId).toBe(reward.id);
    expect(Array.isArray(stored?.diff)).toBe(true);
  });

  it('approve of a create action creates the entity', async () => {
    const cr = (await governance.submit(brandCtx, { entityType: 'reward', action: 'create', payload: { name: 'Via approval', pointsCost: 250 } })) as { id: string };
    const res = (await governance.approve(platformCtx, cr.id)) as { appliedEntityId: string };
    expect(res.appliedEntityId).toBeTruthy();
    const created = (await loyalty.getReward(brandCtx, res.appliedEntityId)) as { name: string };
    expect(created.name).toBe('Via approval');
  });

  it('reject does not apply; withdraw closes a pending request', async () => {
    const reward = (await loyalty.createCatalogItem(brandCtx, { name: 'Keep', pointsCost: 50 })) as { id: string };
    const rej = (await governance.submit(brandCtx, { entityType: 'reward', action: 'update', entityId: reward.id, payload: { pointsCost: 9999 } })) as { id: string };
    await governance.reject(platformCtx, rej.id, 'too expensive');
    const stillSame = (await loyalty.getReward(brandCtx, reward.id)) as { pointsCost: string };
    expect(stillSame.pointsCost).toBe('50');
    expect((await prisma.changeRequest.findUnique({ where: { id: rej.id } }))?.status).toBe('rejected');

    const wd = (await governance.submit(brandCtx, { entityType: 'reward', action: 'update', entityId: reward.id, payload: { pointsCost: 60 } })) as { id: string };
    await governance.withdraw(brandCtx, wd.id);
    expect((await prisma.changeRequest.findUnique({ where: { id: wd.id } }))?.status).toBe('withdrawn');
  });

  it('RLS isolates change requests across brands', async () => {
    const reward = (await loyalty.createCatalogItem(brandCtx, { name: 'Secret', pointsCost: 10 })) as { id: string };
    await governance.submit(brandCtx, { entityType: 'reward', action: 'update', entityId: reward.id, payload: { pointsCost: 20 } });
    const mine = await governance.listForBrand(brandCtx, {});
    const others = await governance.listForBrand(brandBCtx, {});
    expect(mine.total).toBeGreaterThan(0);
    expect(others.total).toBe(0); // brand B sees none of brand A's requests
  });

  it('superadmin sees the full queue and stats', async () => {
    const all = await governance.listAll(platformCtx, {});
    expect(all.total).toBeGreaterThan(0);
    const stats = await governance.stats(platformCtx);
    expect(stats.approved).toBeGreaterThanOrEqual(2);
    expect(stats.rejected).toBeGreaterThanOrEqual(1);
  });
});
