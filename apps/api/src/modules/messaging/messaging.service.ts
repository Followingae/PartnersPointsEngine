import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

/** Variables a brand can reference in templates; previews use these sample values. */
export const TEMPLATE_VARIABLES = ['customer_name', 'loyalty_id', 'points_balance', 'tier', 'brand_name', 'reward', 'expiry_date'] as const;
const SAMPLE: Record<string, string> = {
  customer_name: 'Sara A.',
  loyalty_id: 'CAMELBEAN-00042',
  points_balance: '1,250',
  tier: 'Gold',
  brand_name: 'Camel Bean Coffee',
  reward: 'Free Latte',
  expiry_date: '30 Jun 2027',
};

/** Replace {{ var }} tokens; unknown vars are left intact so authors notice typos. */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);
}

interface ListQuery { q?: string; channel?: string; limit?: number; offset?: number }

@Injectable()
export class MessagingService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  variables() {
    return { variables: TEMPLATE_VARIABLES, sample: SAMPLE };
  }

  async list(ctx: TenantContext, query: ListQuery = {}) {
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.NotificationTemplateWhereInput = {
        brandId: ctx.brandId!,
        ...(query.channel && query.channel !== 'all' ? { channel: query.channel as never } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.notificationTemplate.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(query.limit ?? 100, 200), skip: query.offset ?? 0 }),
        tx.notificationTemplate.count({ where }),
      ]);
      return { rows, total };
    });
  }

  async get(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const t = await tx.notificationTemplate.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!t) throw new NotFoundException('template not found');
      return t;
    });
  }

  async create(ctx: TenantContext, dto: { name: string; channel?: string; event?: string; subject?: string; body: string; locale?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const t = await tx.notificationTemplate.create({
        data: {
          brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId,
          name: dto.name, channel: (dto.channel ?? 'email') as never, event: dto.event ?? null,
          subject: dto.subject ?? null, body: dto.body, locale: dto.locale ?? 'en',
        },
        select: { id: true, name: true, channel: true },
      });
      await this.audit.record(tx, ctx, { action: 'template.create', targetType: 'notification_template', targetId: t.id, data: { name: t.name, channel: t.channel } });
      return t;
    });
  }

  async update(ctx: TenantContext, id: string, dto: { name?: string; channel?: string; event?: string | null; subject?: string | null; body?: string; locale?: string; enabled?: boolean }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.notificationTemplate.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('template not found');
      const t = await tx.notificationTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.channel !== undefined ? { channel: dto.channel as never } : {}),
          ...(dto.event !== undefined ? { event: dto.event } : {}),
          ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        },
        select: { id: true, name: true, enabled: true },
      });
      await this.audit.record(tx, ctx, { action: 'template.update', targetType: 'notification_template', targetId: id, data: { fields: Object.keys(dto) } });
      return t;
    });
  }

  async remove(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.notificationTemplate.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundException('template not found');
      await tx.notificationTemplate.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'template.delete', targetType: 'notification_template', targetId: id, data: { name: existing.name } });
      return { id, deleted: true };
    });
  }

  /** Render a template body/subject with sample data (no send — provider wiring is later). */
  preview(subject: string | null | undefined, body: string) {
    return { subject: interpolate(subject ?? '', SAMPLE), body: interpolate(body ?? '', SAMPLE) };
  }
}
