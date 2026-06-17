import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ledger, Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { StubLuluConnector } from './partner-connector';

/**
 * Customer-facing partnership operations: link a partner account, preview, and
 * **convert** merchant points → partner points. Conversion is atomic and uses an
 * authorize → credit-partner → capture/void sequence so the customer's points are
 * only burned once the partner confirms (works for stub and the future live API).
 */
@Injectable()
export class ConversionService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
    private readonly connector: StubLuluConnector,
  ) {}

  /** Resolve the caller's membership for the current brand (customer surface). */
  private async membershipFor(tx: Prisma.TransactionClient, ctx: TenantContext): Promise<{ id: string; personId: string }> {
    const m = await tx.customerMembership.findUnique({
      where: { personId_brandId: { personId: ctx.actor.id, brandId: ctx.brandId! } },
      select: { id: true, personId: true },
    });
    if (!m) throw new NotFoundException('membership not found');
    return m;
  }

  async linkAccount(ctx: TenantContext, partnerKey: string, memberRef: string) {
    return this.tenants.run(ctx, async (tx) => {
      const partner = await tx.partner.findFirst({ where: { platformId: ctx.platformId, key: partnerKey }, select: { id: true } });
      if (!partner) throw new NotFoundException('partner not found');
      const { valid, memberRef: ref } = await this.connector.lookupMember(memberRef);
      if (!valid) throw new BadRequestException('Could not find that partner account');
      await tx.partnerCustomerLink.upsert({
        where: { partnerId_personId: { partnerId: partner.id, personId: ctx.actor.id } },
        update: { partnerMemberRef: ref, status: 'active' },
        create: { partnerId: partner.id, personId: ctx.actor.id, platformId: ctx.platformId, partnerMemberRef: ref },
      });
      return { linked: true, partnerMemberRef: ref };
    });
  }

  /** Preview the result + eligibility for converting `sourcePoints` at the current brand. */
  async preview(ctx: TenantContext, sourcePoints: number) {
    return this.tenants.run(ctx, async (tx) => {
      const m = await this.membershipFor(tx, ctx);
      const pm = await tx.partnerMerchant.findFirst({ where: { brandId: ctx.brandId!, enabled: true }, include: { partner: true } });
      if (!pm) return { available: false, reason: 'not_enabled' as const };
      const wallet = await tx.allowanceWallet.findFirst({ where: { partnerId: pm.partnerId, brandId: ctx.brandId! } });
      const link = await tx.partnerCustomerLink.findFirst({ where: { partnerId: pm.partnerId, personId: m.personId, status: 'active' } });
      const partnerPoints = Math.floor((sourcePoints * pm.ratioBps) / 10000);
      const costMinor = BigInt(partnerPoints) * pm.partner.costPerPartnerPointMinor;
      const allowanceOk = !!wallet && wallet.balanceMinor >= costMinor;
      return {
        available: pm.status === 'active',
        partner: { key: pm.partner.key, currencyName: pm.partner.currencyName },
        ratioBps: pm.ratioBps,
        minConversion: pm.minConversion,
        sourcePoints,
        partnerPoints,
        linked: !!link,
        allowanceAvailable: allowanceOk,
      };
    });
  }

  async history(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const m = await this.membershipFor(tx, ctx);
      const rows = await tx.conversion.findMany({ where: { brandId: ctx.brandId!, membershipId: m.id }, orderBy: { createdAt: 'desc' }, take: 50 });
      return rows.map((c) => ({ id: c.id, sourcePoints: c.sourcePoints.toString(), partnerPoints: c.partnerPoints.toString(), status: c.status, partnerTxnRef: c.partnerTxnRef, createdAt: c.createdAt }));
    });
  }

  /** The conversion. Idempotent on (brand, idempotencyKey). */
  async convert(ctx: TenantContext, sourcePoints: number, idempotencyKey: string) {
    return this.tenants.run(ctx, async (tx) => {
      const m = await this.membershipFor(tx, ctx);
      const existing = await tx.conversion.findFirst({ where: { brandId: ctx.brandId!, idempotencyKey } });
      if (existing) return this.shape(existing);

      const pm = await tx.partnerMerchant.findFirst({ where: { brandId: ctx.brandId!, enabled: true }, include: { partner: true } });
      if (!pm || pm.status !== 'active') throw new BadRequestException('Conversions are not available for this merchant right now');
      if (sourcePoints <= 0 || sourcePoints < pm.minConversion) throw new BadRequestException('Below the minimum conversion amount');

      if (pm.maxConversionPerDay > 0) {
        const since = new Date(); since.setHours(0, 0, 0, 0);
        const agg = await tx.conversion.aggregate({ _sum: { sourcePoints: true }, where: { brandId: ctx.brandId!, membershipId: m.id, createdAt: { gte: since }, status: { in: ['pending', 'completed'] } } });
        if (Number(agg._sum.sourcePoints ?? 0n) + sourcePoints > pm.maxConversionPerDay) throw new BadRequestException('Daily conversion limit reached');
      }

      const link = await tx.partnerCustomerLink.findFirst({ where: { partnerId: pm.partnerId, personId: m.personId, status: 'active' } });
      if (!link) throw new BadRequestException('Link your partner account first');

      const partnerPoints = Math.floor((sourcePoints * pm.ratioBps) / 10000);
      if (partnerPoints <= 0) throw new BadRequestException('Amount too small to convert');
      const costMinor = BigInt(partnerPoints) * pm.partner.costPerPartnerPointMinor;

      const wallet = await tx.allowanceWallet.findFirst({ where: { partnerId: pm.partnerId, brandId: ctx.brandId! } });
      if (!wallet || wallet.balanceMinor < costMinor) throw new BadRequestException('Merchant allowance is currently depleted — please try again later');

      const scope = { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: m.id };
      const points = BigInt(sourcePoints);
      // 1) hold the customer's points
      await ledger.authorizeRedeem(tx, { scope, points, occurredAt: new Date(), sourceEvent: `convert:${idempotencyKey}`, channel: 'online', idem: { actorId: ctx.actor.id, key: `conv:${idempotencyKey}:auth` } });
      // 2) reserve allowance + record pending conversion
      await tx.allowanceWallet.update({ where: { id: wallet.id }, data: { balanceMinor: { decrement: costMinor } } });
      await tx.allowanceTxn.create({ data: { walletId: wallet.id, brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, direction: 'debit', amountMinor: costMinor, reason: 'conversion' } });
      const conv = await tx.conversion.create({ data: { partnerId: pm.partnerId, brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, membershipId: m.id, sourcePoints: points, partnerPoints: BigInt(partnerPoints), ratioBps: pm.ratioBps, allowanceCostMinor: costMinor, status: 'pending', idempotencyKey } });

      try {
        // 3) credit the partner; 4) finalize the burn
        const { partnerTxnRef } = await this.connector.creditPoints({ memberRef: link.partnerMemberRef, points: partnerPoints, idempotencyKey, ref: conv.id });
        await ledger.captureRedeem(tx, { scope, points, occurredAt: new Date(), sourceEvent: `convert:${idempotencyKey}`, channel: 'online', idem: { actorId: ctx.actor.id, key: `conv:${idempotencyKey}:cap` } });
        const done = await tx.conversion.update({ where: { id: conv.id }, data: { status: 'completed', partnerTxnRef, completedAt: new Date() } });
        await this.audit.record(tx, ctx, { action: 'partner.convert', targetType: 'conversion', targetId: conv.id, data: { partner: pm.partner.key, sourcePoints, partnerPoints } });
        return this.shape(done);
      } catch (e) {
        // reverse: void the hold + refund allowance
        await ledger.voidRedeem(tx, { scope, points, occurredAt: new Date(), sourceEvent: `convert:${idempotencyKey}`, channel: 'online', idem: { actorId: ctx.actor.id, key: `conv:${idempotencyKey}:void` } }).catch(() => {});
        await tx.allowanceWallet.update({ where: { id: wallet.id }, data: { balanceMinor: { increment: costMinor } } });
        await tx.allowanceTxn.create({ data: { walletId: wallet.id, brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, direction: 'credit', amountMinor: costMinor, reason: 'reversal', conversionId: conv.id } });
        const failed = await tx.conversion.update({ where: { id: conv.id }, data: { status: 'failed', failureReason: e instanceof Error ? e.message : 'partner error' } });
        return this.shape(failed);
      }
    });
  }

  private shape(c: { id: string; sourcePoints: bigint; partnerPoints: bigint; status: string; partnerTxnRef: string | null; createdAt: Date }) {
    return { id: c.id, sourcePoints: c.sourcePoints.toString(), partnerPoints: c.partnerPoints.toString(), status: c.status, partnerTxnRef: c.partnerTxnRef, createdAt: c.createdAt };
  }
}
