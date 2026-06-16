import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

export interface SegmentRule {
  field: 'lifetime' | 'recencyDays' | 'frequency' | 'status' | 'tier';
  op: 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'neq';
  value: string | number;
}
export interface SegmentDefinition {
  match?: 'all' | 'any';
  rules?: SegmentRule[];
}

const FIELD_COL: Record<SegmentRule['field'], string> = {
  lifetime: 'a.lifetime',
  recencyDays: 'a.recency_days',
  frequency: 'a.frequency',
  status: 'a.status',
  tier: 'a.tier',
};
const TEXT_FIELDS = new Set(['status', 'tier']);
const OP_SQL: Record<SegmentRule['op'], string> = { gte: '>=', lte: '<=', gt: '>', lt: '<', eq: '=', neq: '<>' };

interface ListQuery { q?: string; limit?: number; offset?: number }

@Injectable()
export class SegmentService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /** The member-attribute model segments evaluate against (lifetime / recency / frequency / status / tier). */
  private attrsCte(ctx: TenantContext): Prisma.Sql {
    return Prisma.sql`
      WITH a AS (
        SELECT m.id AS membership_id, m.loyalty_id, m.status::text AS status,
               coalesce(ab.posted_credits, 0)::bigint AS lifetime,
               coalesce((EXTRACT(EPOCH FROM (now() - last.last_at)) / 86400)::int, 99999) AS recency_days,
               coalesce(last.freq, 0)::int AS frequency,
               coalesce(t.name, '') AS tier
          FROM customer_membership m
          LEFT JOIN ledger_account la ON la.customer_id = m.id AND la.brand_id = m.brand_id AND la.account_type = 'points_liability'
          LEFT JOIN account_balance ab ON ab.account_id = la.id
          LEFT JOIN LATERAL (
            SELECT max(j.occurred_at) AS last_at, count(DISTINCT j.id) AS freq
              FROM entry e JOIN journal j ON j.id = e.journal_id AND j.kind = 'earn'
             WHERE e.account_id = la.id AND e.direction = 'credit'
          ) last ON true
          LEFT JOIN LATERAL (
            SELECT name FROM tier WHERE brand_id = m.brand_id AND threshold <= coalesce(ab.posted_credits, 0) ORDER BY threshold DESC LIMIT 1
          ) t ON true
         WHERE m.brand_id = ${ctx.brandId}
      )`;
  }

  private whereClause(def: SegmentDefinition): Prisma.Sql {
    const rules = def.rules ?? [];
    if (!rules.length) return Prisma.sql`true`;
    const parts = rules.map((r) => {
      const col = FIELD_COL[r.field];
      const op = OP_SQL[r.op];
      if (!col || !op) throw new BadRequestException(`invalid rule: ${r.field} ${r.op}`);
      const value = TEXT_FIELDS.has(r.field) ? Prisma.sql`${String(r.value)}` : Prisma.sql`${Number(r.value)}`;
      return Prisma.sql`${Prisma.raw(col)} ${Prisma.raw(op)} ${value}`;
    });
    return Prisma.join(parts, def.match === 'any' ? ' OR ' : ' AND ');
  }

  /** Member count + sample matching a definition (live preview, no persistence). */
  async preview(ctx: TenantContext, def: SegmentDefinition, sampleN = 10) {
    return this.tenants.run(ctx, async (tx) => {
      const where = this.whereClause(def);
      const cte = this.attrsCte(ctx);
      const countRows = await tx.$queryRaw<{ c: bigint }[]>(Prisma.sql`${cte} SELECT count(*)::bigint AS c FROM a WHERE ${where}`);
      const sample = await tx.$queryRaw<{ membership_id: string; loyalty_id: string; lifetime: bigint; recency_days: number; frequency: number; tier: string }[]>(
        Prisma.sql`${cte} SELECT membership_id, loyalty_id, lifetime, recency_days, frequency, tier FROM a WHERE ${where} ORDER BY lifetime DESC LIMIT ${sampleN}`,
      );
      return {
        count: Number(countRows[0]?.c ?? 0n),
        sample: sample.map((s) => ({ membershipId: s.membership_id, loyaltyId: s.loyalty_id, lifetime: s.lifetime.toString(), recencyDays: s.recency_days, frequency: s.frequency, tier: s.tier || null })),
      };
    });
  }

  async create(ctx: TenantContext, dto: { name: string; description?: string; definition: SegmentDefinition }) {
    return this.tenants.run(ctx, async (tx) => {
      const seg = await tx.segment.create({
        data: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, name: dto.name, description: dto.description ?? null, definition: (dto.definition ?? {}) as Prisma.InputJsonValue },
        select: { id: true, name: true },
      });
      await this.audit.record(tx, ctx, { action: 'segment.create', targetType: 'segment', targetId: seg.id, data: { name: seg.name } });
      return seg;
    });
  }

  async list(ctx: TenantContext, query: ListQuery = {}) {
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.SegmentWhereInput = { brandId: ctx.brandId!, status: { not: 'archived' }, ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}) };
      const [rows, total] = await Promise.all([
        tx.segment.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(query.limit ?? 100, 200), skip: query.offset ?? 0 }),
        tx.segment.count({ where }),
      ]);
      return { rows, total };
    });
  }

  async get(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const s = await tx.segment.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!s) throw new NotFoundException('segment not found');
      return s;
    });
  }

  async update(ctx: TenantContext, id: string, dto: { name?: string; description?: string; definition?: SegmentDefinition }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.segment.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('segment not found');
      const s = await tx.segment.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.definition !== undefined ? { definition: dto.definition as Prisma.InputJsonValue } : {}),
        },
        select: { id: true, name: true },
      });
      await this.audit.record(tx, ctx, { action: 'segment.update', targetType: 'segment', targetId: id, data: { fields: Object.keys(dto) } });
      return s;
    });
  }

  async remove(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.segment.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundException('segment not found');
      await tx.segment.update({ where: { id }, data: { status: 'archived' } });
      await this.audit.record(tx, ctx, { action: 'segment.archive', targetType: 'segment', targetId: id, data: { name: existing.name } });
      return { id, archived: true };
    });
  }

  /** Members matching a saved segment. */
  async members(ctx: TenantContext, id: string, limit = 100) {
    const seg = await this.get(ctx, id);
    return this.preview(ctx, (seg.definition ?? {}) as SegmentDefinition, limit);
  }
}
