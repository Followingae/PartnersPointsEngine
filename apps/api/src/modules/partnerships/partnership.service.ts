import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { StubLuluConnector } from './partner-connector';

/** Superadmin + brand-facing partnership management: partner config, per-merchant
    enablement, prepaid allowance wallet, and reporting. */
@Injectable()
export class PartnershipService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly connector: StubLuluConnector,
  ) {}

  // ── Partner (superadmin) ──────────────────────────────────────────────────

  /** Create the Lulu partner row if it doesn't exist yet (idempotent). */
  async ensureLulu(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.partner.findFirst({ where: { platformId: ctx.platformId, key: 'lulu' }, select: { id: true } });
      if (existing) return existing;
      const p = await tx.partner.create({
        data: { platformId: ctx.platformId, key: 'lulu', name: 'Lulu Hypermarkets', currencyName: 'Lulu Happiness Points', connectorMode: 'stub' },
        select: { id: true },
      });
      await this.audit.record(tx, ctx, { action: 'partner.create', targetType: 'partner', targetId: p.id, data: { key: 'lulu' } });
      return p;
    });
  }

  async listPartners(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const partners = await tx.partner.findMany({ where: { platformId: ctx.platformId }, orderBy: { createdAt: 'asc' } });
      const since = new Date(Date.now() - 30 * 86400000);
      return Promise.all(partners.map(async (p) => {
        const [enabledMerchants, conversions30d, allowance] = await Promise.all([
          tx.partnerMerchant.count({ where: { partnerId: p.id, enabled: true } }),
          tx.conversion.count({ where: { partnerId: p.id, status: 'completed', createdAt: { gte: since } } }),
          tx.allowanceWallet.aggregate({ _sum: { balanceMinor: true }, where: { partnerId: p.id } }),
        ]);
        return { id: p.id, key: p.key, name: p.name, currencyName: p.currencyName, status: p.status, connectorMode: p.connectorMode, defaultRatioBps: p.defaultRatioBps, costPerPartnerPointMinor: p.costPerPartnerPointMinor.toString(), enabledMerchants, conversions30d, allowanceOutstanding: (allowance._sum.balanceMinor ?? 0n).toString() };
      }));
    });
  }

  async getPartner(ctx: TenantContext, partnerId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const p = await tx.partner.findFirst({ where: { id: partnerId, platformId: ctx.platformId } });
      if (!p) throw new NotFoundException('partner not found');
      return { id: p.id, key: p.key, name: p.name, currencyName: p.currencyName, status: p.status, connectorMode: p.connectorMode, defaultRatioBps: p.defaultRatioBps, costPerPartnerPointMinor: p.costPerPartnerPointMinor.toString(), hasConnectorConfig: !!p.connectorConfigEnc };
    });
  }

  async updatePartner(ctx: TenantContext, partnerId: string, dto: { name?: string; currencyName?: string; connectorMode?: 'stub' | 'sandbox' | 'live'; defaultRatioBps?: number; costPerPartnerPointMinor?: number; connectorConfig?: Record<string, unknown> }) {
    return this.tenants.run(ctx, async (tx) => {
      const p = await tx.partner.findFirst({ where: { id: partnerId, platformId: ctx.platformId }, select: { id: true } });
      if (!p) throw new NotFoundException('partner not found');
      await tx.partner.update({
        where: { id: partnerId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.currencyName !== undefined ? { currencyName: dto.currencyName } : {}),
          ...(dto.connectorMode !== undefined ? { connectorMode: dto.connectorMode } : {}),
          ...(dto.defaultRatioBps !== undefined ? { defaultRatioBps: dto.defaultRatioBps } : {}),
          ...(dto.costPerPartnerPointMinor !== undefined ? { costPerPartnerPointMinor: BigInt(dto.costPerPartnerPointMinor) } : {}),
          ...(dto.connectorConfig !== undefined ? { connectorConfigEnc: this.crypto.encrypt(JSON.stringify(dto.connectorConfig)) } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'partner.update', targetType: 'partner', targetId: partnerId, data: { fields: Object.keys(dto) } });
      return { id: partnerId, updated: true };
    });
  }

  async health(ctx: TenantContext, partnerId: string) {
    const p = await this.getPartner(ctx, partnerId);
    const h = await this.connector.health();
    return { mode: p.connectorMode, ...h };
  }

  // ── Per-merchant enablement + allowance (superadmin) ──────────────────────

  async listMerchants(ctx: TenantContext, partnerId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.partnerMerchant.findMany({ where: { partnerId, platformId: ctx.platformId }, orderBy: { createdAt: 'asc' } });
      const brandIds = rows.map((r) => r.brandId);
      const [brands, wallets] = await Promise.all([
        brandIds.length ? tx.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } }) : [],
        tx.allowanceWallet.findMany({ where: { partnerId, brandId: { in: brandIds } } }),
      ]);
      const bn = new Map(brands.map((b) => [b.id, b.name]));
      const wm = new Map(wallets.map((w) => [w.brandId, w]));
      return Promise.all(rows.map(async (r) => {
        const conversions = await tx.conversion.count({ where: { partnerId, brandId: r.brandId, status: 'completed' } });
        const w = wm.get(r.brandId);
        return { id: r.id, brandId: r.brandId, brandName: bn.get(r.brandId) ?? '', enabled: r.enabled, status: r.status, ratioBps: r.ratioBps, minConversion: r.minConversion, maxConversionPerDay: r.maxConversionPerDay, allowanceBalance: (w?.balanceMinor ?? 0n).toString(), lowBalanceThreshold: (w?.lowBalanceThresholdMinor ?? 0n).toString(), conversions };
      }));
    });
  }

  async enableMerchant(ctx: TenantContext, dto: { partnerId: string; brandId: string; ratioBps?: number; minConversion?: number; maxConversionPerDay?: number; lowBalanceThresholdMinor?: number }) {
    return this.tenants.run(ctx, async (tx) => {
      const partner = await tx.partner.findFirst({ where: { id: dto.partnerId, platformId: ctx.platformId }, select: { id: true, defaultRatioBps: true } });
      if (!partner) throw new NotFoundException('partner not found');
      const brand = await tx.brand.findFirst({ where: { id: dto.brandId, platformId: ctx.platformId }, select: { id: true, groupId: true, moduleAccess: true } });
      if (!brand) throw new NotFoundException('brand not found');
      const pm = await tx.partnerMerchant.upsert({
        where: { partnerId_brandId: { partnerId: dto.partnerId, brandId: dto.brandId } },
        update: { enabled: true, status: 'active', ratioBps: dto.ratioBps ?? undefined, minConversion: dto.minConversion ?? undefined, maxConversionPerDay: dto.maxConversionPerDay ?? undefined },
        create: { partnerId: dto.partnerId, brandId: dto.brandId, groupId: brand.groupId, platformId: ctx.platformId, ratioBps: dto.ratioBps ?? partner.defaultRatioBps, minConversion: dto.minConversion ?? 0, maxConversionPerDay: dto.maxConversionPerDay ?? 0 },
      });
      await tx.allowanceWallet.upsert({
        where: { partnerId_brandId: { partnerId: dto.partnerId, brandId: dto.brandId } },
        update: { ...(dto.lowBalanceThresholdMinor !== undefined ? { lowBalanceThresholdMinor: BigInt(dto.lowBalanceThresholdMinor) } : {}) },
        create: { partnerId: dto.partnerId, brandId: dto.brandId, groupId: brand.groupId, platformId: ctx.platformId, lowBalanceThresholdMinor: BigInt(dto.lowBalanceThresholdMinor ?? 0) },
      });
      // turn the brand-console module on
      const merged = { ...((brand.moduleAccess ?? {}) as Record<string, boolean>), partnerships: true };
      await tx.brand.update({ where: { id: dto.brandId }, data: { moduleAccess: merged as Prisma.InputJsonValue } });
      await this.audit.record(tx, ctx, { action: 'partner.merchant.enable', targetType: 'partner_merchant', targetId: pm.id, data: { brandId: dto.brandId } });
      return { id: pm.id, enabled: true };
    });
  }

  async updateMerchant(ctx: TenantContext, id: string, dto: { ratioBps?: number; status?: 'active' | 'inactive'; minConversion?: number; maxConversionPerDay?: number; enabled?: boolean }) {
    return this.tenants.run(ctx, async (tx) => {
      const pm = await tx.partnerMerchant.findFirst({ where: { id, platformId: ctx.platformId }, select: { id: true } });
      if (!pm) throw new NotFoundException('not found');
      await tx.partnerMerchant.update({ where: { id }, data: {
        ...(dto.ratioBps !== undefined ? { ratioBps: dto.ratioBps } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.minConversion !== undefined ? { minConversion: dto.minConversion } : {}),
        ...(dto.maxConversionPerDay !== undefined ? { maxConversionPerDay: dto.maxConversionPerDay } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      } });
      await this.audit.record(tx, ctx, { action: 'partner.merchant.update', targetType: 'partner_merchant', targetId: id, data: { fields: Object.keys(dto) } });
      return { id, updated: true };
    });
  }

  async fundAllowance(ctx: TenantContext, dto: { partnerId: string; brandId: string; amountMinor: number }) {
    if (dto.amountMinor <= 0) throw new BadRequestException('amount must be positive');
    return this.tenants.run(ctx, async (tx) => {
      const w = await tx.allowanceWallet.findFirst({ where: { partnerId: dto.partnerId, brandId: dto.brandId } });
      if (!w) throw new NotFoundException('allowance wallet not found');
      const updated = await tx.allowanceWallet.update({ where: { id: w.id }, data: { balanceMinor: { increment: BigInt(dto.amountMinor) } } });
      await tx.allowanceTxn.create({ data: { walletId: w.id, brandId: dto.brandId, groupId: w.groupId, platformId: ctx.platformId, direction: 'credit', amountMinor: BigInt(dto.amountMinor), reason: 'topup' } });
      await this.audit.record(tx, ctx, { action: 'partner.allowance.fund', targetType: 'allowance_wallet', targetId: w.id, data: { amountMinor: dto.amountMinor } });
      return { balanceMinor: updated.balanceMinor.toString() };
    });
  }

  async setThreshold(ctx: TenantContext, dto: { partnerId: string; brandId: string; thresholdMinor: number }) {
    return this.tenants.run(ctx, async (tx) => {
      const w = await tx.allowanceWallet.findFirst({ where: { partnerId: dto.partnerId, brandId: dto.brandId }, select: { id: true } });
      if (!w) throw new NotFoundException('allowance wallet not found');
      await tx.allowanceWallet.update({ where: { id: w.id }, data: { lowBalanceThresholdMinor: BigInt(dto.thresholdMinor) } });
      return { updated: true };
    });
  }

  // ── Reports (superadmin) ──────────────────────────────────────────────────

  async overview(ctx: TenantContext, partnerId: string, days = 30) {
    return this.tenants.run(ctx, async (tx) => {
      const since = new Date(Date.now() - days * 86400000);
      const [agg, failed, activeMerchants, allowance] = await Promise.all([
        tx.conversion.aggregate({ _count: true, _sum: { sourcePoints: true, partnerPoints: true, allowanceCostMinor: true }, where: { partnerId, status: 'completed', createdAt: { gte: since } } }),
        tx.conversion.count({ where: { partnerId, status: 'failed', createdAt: { gte: since } } }),
        tx.partnerMerchant.count({ where: { partnerId, enabled: true, status: 'active' } }),
        tx.allowanceWallet.aggregate({ _sum: { balanceMinor: true }, where: { partnerId } }),
      ]);
      const conversions = agg._count;
      return {
        days,
        conversions,
        sourceBurned: (agg._sum.sourcePoints ?? 0n).toString(),
        partnerIssued: (agg._sum.partnerPoints ?? 0n).toString(),
        allowanceSpent: (agg._sum.allowanceCostMinor ?? 0n).toString(),
        failed,
        successRate: conversions + failed > 0 ? Math.round((conversions / (conversions + failed)) * 100) : 100,
        activeMerchants,
        allowanceOutstanding: (allowance._sum.balanceMinor ?? 0n).toString(),
      };
    });
  }

  async trend(ctx: TenantContext, partnerId: string, days = 30) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ d: string; conversions: bigint; issued: bigint; spent: bigint }[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d,
               count(*)::bigint AS conversions,
               coalesce(sum(partner_points), 0)::bigint AS issued,
               coalesce(sum(allowance_cost_minor), 0)::bigint AS spent
          FROM conversion
         WHERE partner_id = ${partnerId} AND status = 'completed' AND created_at >= (current_date - ${days}::int)
         GROUP BY 1 ORDER BY 1`;
      return rows.map((r) => ({ date: r.d, conversions: Number(r.conversions), issued: r.issued.toString(), spent: r.spent.toString() }));
    });
  }

  async listConversions(ctx: TenantContext, partnerId: string, status?: string) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.conversion.findMany({
        where: { partnerId, platformId: ctx.platformId, ...(status ? { status: status as never } : {}) },
        orderBy: { createdAt: 'desc' }, take: 100,
      });
      return rows.map((c) => ({ id: c.id, brandId: c.brandId, membershipId: c.membershipId, sourcePoints: c.sourcePoints.toString(), partnerPoints: c.partnerPoints.toString(), allowanceCostMinor: c.allowanceCostMinor.toString(), status: c.status, partnerTxnRef: c.partnerTxnRef, failureReason: c.failureReason, createdAt: c.createdAt }));
    });
  }

  // ── Brand-facing ──────────────────────────────────────────────────────────

  async brandStatus(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const pm = await tx.partnerMerchant.findFirst({ where: { brandId: ctx.brandId! }, include: { partner: true } });
      if (!pm) return { enabled: false as const };
      const w = await tx.allowanceWallet.findFirst({ where: { brandId: ctx.brandId!, partnerId: pm.partnerId } });
      return {
        enabled: pm.enabled,
        status: pm.status,
        partner: { key: pm.partner.key, name: pm.partner.name, currencyName: pm.partner.currencyName },
        ratioBps: pm.ratioBps,
        minConversion: pm.minConversion,
        maxConversionPerDay: pm.maxConversionPerDay,
        allowanceBalance: (w?.balanceMinor ?? 0n).toString(),
        lowBalanceThreshold: (w?.lowBalanceThresholdMinor ?? 0n).toString(),
      };
    });
  }

  async brandReports(ctx: TenantContext, days = 30) {
    return this.tenants.run(ctx, async (tx) => {
      const since = new Date(Date.now() - days * 86400000);
      const agg = await tx.conversion.aggregate({ _count: true, _sum: { sourcePoints: true, partnerPoints: true }, where: { brandId: ctx.brandId!, status: 'completed', createdAt: { gte: since } } });
      const trend = await tx.$queryRaw<{ d: string; conversions: bigint; issued: bigint }[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, count(*)::bigint AS conversions, coalesce(sum(partner_points),0)::bigint AS issued
          FROM conversion WHERE brand_id = ${ctx.brandId} AND status='completed' AND created_at >= (current_date - ${days}::int)
         GROUP BY 1 ORDER BY 1`;
      return { conversions: agg._count, sourceBurned: (agg._sum.sourcePoints ?? 0n).toString(), partnerIssued: (agg._sum.partnerPoints ?? 0n).toString(), trend: trend.map((r) => ({ date: r.d, conversions: Number(r.conversions), issued: r.issued.toString() })) };
    });
  }

  async brandActivity(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.conversion.findMany({ where: { brandId: ctx.brandId! }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, membershipId: true, sourcePoints: true, partnerPoints: true, status: true, partnerTxnRef: true, createdAt: true } });
      return rows.map((c) => ({ id: c.id, membershipId: c.membershipId, sourcePoints: c.sourcePoints.toString(), partnerPoints: c.partnerPoints.toString(), status: c.status, partnerTxnRef: c.partnerTxnRef, createdAt: c.createdAt }));
    });
  }

  async requestTopup(ctx: TenantContext, amountMinor: number) {
    return this.tenants.run(ctx, async (tx) => {
      await this.audit.record(tx, ctx, { action: 'partner.allowance.topup_request', targetType: 'brand', targetId: ctx.brandId!, data: { amountMinor } });
      return { requested: true };
    });
  }
}
