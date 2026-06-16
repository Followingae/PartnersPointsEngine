import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rfm-loyalty/db';
import { EarnRule, type TenantContext } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { sortClause, type ListQuery, type ListResult } from './list';

/**
 * Campaigns = time-boxed earn rules (bonus/multiplier/etc.) evaluated alongside
 * the brand's standing earn rules when active. Reuses the rules engine.
 */
@Injectable()
export class CampaignService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /** Active-window campaign rules for the current brand (within an existing tx). */
  async activeRules(tx: Prisma.TransactionClient, ctx: TenantContext, now = new Date()): Promise<EarnRule[]> {
    const rows = await tx.campaign.findMany({ where: { brandId: ctx.brandId!, enabled: true } });
    return rows
      .filter((c) => (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt >= now))
      .map((c) => {
        const def = (c.definition ?? {}) as { condition?: unknown; actions?: unknown };
        return EarnRule.parse({ id: c.id, name: c.name, priority: 100, enabled: true, condition: def.condition, actions: def.actions ?? [] });
      });
  }

  async listCampaigns(ctx: TenantContext, query: ListQuery = {}) {
    const { sort, order } = sortClause(query, ['name', 'createdAt', 'startsAt', 'endsAt'], 'createdAt', 'desc');
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.CampaignWhereInput = {
        brandId: ctx.brandId!,
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
        ...(query.status === 'enabled' ? { enabled: true } : query.status === 'disabled' ? { enabled: false } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.campaign.findMany({ where, orderBy: { [sort]: order }, take: query.limit ?? 100, skip: query.offset ?? 0 }),
        tx.campaign.count({ where }),
      ]);
      return { rows, total } satisfies ListResult<unknown>;
    });
  }

  async getCampaign(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const c = await tx.campaign.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!c) throw new NotFoundException('campaign not found');
      return c;
    });
  }

  async createCampaign(ctx: TenantContext, dto: { name: string; startsAt?: string; endsAt?: string; enabled?: boolean; definition: Record<string, unknown> }) {
    EarnRule.parse({ id: 'preview', name: dto.name, priority: 100, enabled: true, condition: dto.definition.condition, actions: dto.definition.actions ?? [] });
    return this.tenants.run(ctx, async (tx) => {
      const c = await tx.campaign.create({
        data: {
          brandId: ctx.brandId!,
          groupId: ctx.groupId!,
          platformId: ctx.platformId,
          name: dto.name,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          enabled: dto.enabled ?? true,
          definition: dto.definition as Prisma.InputJsonValue,
        },
        select: { id: true, name: true, startsAt: true, endsAt: true, enabled: true },
      });
      await this.audit.record(tx, ctx, { action: 'campaign.create', targetType: 'campaign', targetId: c.id, data: { name: c.name } });
      return c;
    });
  }

  async updateCampaign(ctx: TenantContext, id: string, dto: { name?: string; startsAt?: string | null; endsAt?: string | null; enabled?: boolean; definition?: Record<string, unknown> }) {
    if (dto.definition) {
      EarnRule.parse({ id: 'preview', name: dto.name ?? 'preview', priority: 100, enabled: true, condition: dto.definition.condition, actions: dto.definition.actions ?? [] });
    }
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.campaign.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('campaign not found');
      const c = await tx.campaign.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
          ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.definition !== undefined ? { definition: dto.definition as Prisma.InputJsonValue } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'campaign.update', targetType: 'campaign', targetId: id, data: { fields: Object.keys(dto) } });
      return c;
    });
  }

  async deleteCampaign(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.campaign.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundException('campaign not found');
      await tx.campaign.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'campaign.delete', targetType: 'campaign', targetId: id, data: { name: existing.name } });
      return { id, deleted: true };
    });
  }

  async cloneCampaign(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const src = await tx.campaign.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!src) throw new NotFoundException('campaign not found');
      const copy = await tx.campaign.create({
        data: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, name: `${src.name} (copy)`, startsAt: src.startsAt, endsAt: src.endsAt, enabled: false, definition: src.definition as Prisma.InputJsonValue },
      });
      await this.audit.record(tx, ctx, { action: 'campaign.clone', targetType: 'campaign', targetId: copy.id, data: { from: id } });
      return copy;
    });
  }
}
