import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { COUNTRIES, MONTHS } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

export interface SegmentRule {
  field:
    | 'lifetime' | 'recencyDays' | 'frequency' | 'status' | 'tier'
    | 'nationality' | 'gender' | 'ageYears' | 'birthMonth';
  op: 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'neq' | 'in' | 'not_in' | 'is_set' | 'is_not_set';
  value: string | number | Array<string | number>;
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
  // Demographics. The schema always described these as "stored queryable so
  // they can drive segments"; until now nothing joined `person`, so they
  // couldn't.
  nationality: 'a.nationality',
  gender: 'a.gender',
  ageYears: 'a.age_years',
  birthMonth: 'a.birth_month',
};
const TEXT_FIELDS = new Set(['status', 'tier', 'nationality', 'gender']);
const OP_SQL: Record<'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'neq', string> = {
  gte: '>=', lte: '<=', gt: '>', lt: '<', eq: '=', neq: '<>',
};
/** Operators that take a list rather than a single value. */
const SET_OPS = new Set(['in', 'not_in']);
/** Operators that take no value at all. */
const NULLARY_OPS = new Set(['is_set', 'is_not_set']);

interface ListQuery { q?: string; limit?: number; offset?: number }

@Injectable()
export class SegmentService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The member-attribute model segments evaluate against.
   *
   * Behaviour (lifetime / recency / frequency / tier) plus the demographics on
   * `person`. The join to `person` is what makes nationality, gender and age
   * targetable at all — the schema always claimed those were "stored queryable
   * so they can drive segments", but nothing joined the table, so they weren't.
   *
   * Age and birth month are derived rather than stored: a stored age is wrong
   * within a year, and birthday campaigns want the month regardless of year.
   */
  private attrsCte(ctx: TenantContext): Prisma.Sql {
    return Prisma.sql`
      WITH a AS (
        SELECT m.id AS membership_id, m.loyalty_id, m.status::text AS status,
               coalesce(ab.posted_credits, 0)::bigint AS lifetime,
               coalesce((EXTRACT(EPOCH FROM (now() - last.last_at)) / 86400)::int, 99999) AS recency_days,
               coalesce(last.freq, 0)::int AS frequency,
               coalesce(t.name, '') AS tier,
               p.nationality AS nationality,
               p.gender AS gender,
               CASE WHEN p.birthdate IS NULL THEN NULL
                    ELSE date_part('year', age(p.birthdate))::int END AS age_years,
               CASE WHEN p.birthdate IS NULL THEN NULL
                    ELSE date_part('month', p.birthdate)::int END AS birth_month
          FROM customer_membership m
          JOIN person p ON p.id = m.person_id
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

  /**
   * Compiles a definition to SQL.
   *
   * Null handling is the subtle part. A member who never gave their nationality
   * is *unknown*, not "not Emirati" — so a negative rule (`neq`, `not_in`)
   * excludes them rather than sweeping them in. SQL's three-valued logic does
   * this by default for `<>`, and the same choice is made explicit for
   * `not_in`. A brand wanting those people can ask for them directly with
   * `is_not_set`, which is honest about what it is selecting.
   */
  private whereClause(def: SegmentDefinition): Prisma.Sql {
    const rules = def.rules ?? [];
    if (!rules.length) return Prisma.sql`true`;

    const parts = rules.map((r) => {
      const col = FIELD_COL[r.field];
      if (!col) throw new BadRequestException(`unknown field: ${r.field}`);

      if (NULLARY_OPS.has(r.op)) {
        return r.op === 'is_set'
          ? Prisma.sql`${Prisma.raw(col)} IS NOT NULL AND ${Prisma.raw(col)} <> ''`
          : Prisma.sql`(${Prisma.raw(col)} IS NULL OR ${Prisma.raw(col)} = '')`;
      }

      const isText = TEXT_FIELDS.has(r.field);

      if (SET_OPS.has(r.op)) {
        const raw = Array.isArray(r.value)
          ? r.value
          : String(r.value).split(',').map((v) => v.trim()).filter(Boolean);
        if (!raw.length) throw new BadRequestException(`${r.field} ${r.op} needs at least one value`);
        const items = raw.map((v) =>
          isText ? Prisma.sql`${String(v).toUpperCase()}` : Prisma.sql`${Number(v)}`,
        );
        const list = Prisma.join(items, ', ');
        // `NOT IN` against a null column yields null, which reads as false —
        // so an unknown value is excluded rather than matched. That is the
        // intended meaning here; `is_not_set` exists for the other case.
        return r.op === 'in'
          ? Prisma.sql`${Prisma.raw(col)} IN (${list})`
          : Prisma.sql`${Prisma.raw(col)} NOT IN (${list})`;
      }

      const op = OP_SQL[r.op as keyof typeof OP_SQL];
      if (!op) throw new BadRequestException(`invalid rule: ${r.field} ${r.op}`);
      // Country codes are stored uppercase; compare like for like so a rule
      // written as "ae" still matches.
      const value = isText
        ? Prisma.sql`${r.field === 'nationality' ? String(r.value).toUpperCase() : String(r.value)}`
        : Prisma.sql`${Number(r.value)}`;
      return Prisma.sql`${Prisma.raw(col)} ${Prisma.raw(op)} ${value}`;
    });
    return Prisma.join(parts, def.match === 'any' ? ' OR ' : ' AND ');
  }

  /**
   * What a segment can filter on, for the console's rule builder.
   *
   * The builder used to hardcode its own copy of this list, which had to be
   * kept in step with the server by hand. Serving it means a new attribute
   * appears in the UI the moment the engine understands it.
   */
  fields(): Array<{
    key: SegmentRule['field'];
    label: string;
    type: 'number' | 'text' | 'enum';
    ops: SegmentRule['op'][];
    options?: Array<{ value: string; label: string }>;
  }> {
    const compare: SegmentRule['op'][] = ['gte', 'lte', 'gt', 'lt', 'eq', 'neq'];
    const member: SegmentRule['op'][] = ['in', 'not_in', 'eq', 'neq', 'is_set', 'is_not_set'];
    return [
      { key: 'lifetime', label: 'Lifetime points', type: 'number', ops: compare },
      { key: 'recencyDays', label: 'Days since last visit', type: 'number', ops: compare },
      { key: 'frequency', label: 'Visit count', type: 'number', ops: compare },
      { key: 'tier', label: 'Tier', type: 'text', ops: ['eq', 'neq', 'in', 'not_in'] },
      { key: 'status', label: 'Status', type: 'enum', ops: ['eq', 'neq'],
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'suspended', label: 'Suspended' },
        ] },
      { key: 'nationality', label: 'Nationality', type: 'enum', ops: member,
        options: COUNTRIES.map((c) => ({ value: c.code, label: c.name })) },
      { key: 'gender', label: 'Gender', type: 'enum', ops: member,
        options: [
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'other', label: 'Other' },
        ] },
      { key: 'ageYears', label: 'Age', type: 'number', ops: [...compare, 'is_set', 'is_not_set'] },
      { key: 'birthMonth', label: 'Birthday month', type: 'enum',
        ops: ['eq', 'in', 'is_set', 'is_not_set'],
        options: MONTHS.map((m, i) => ({ value: String(i + 1), label: m })) },
    ];
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
