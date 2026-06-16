import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
const randChar = () => ALPHABET[randomInt(ALPHABET.length)];

/** Fill a pattern: each '#' → random char. No '#' → append a 6-char suffix. */
function fromPattern(pattern: string): string {
  if (pattern.includes('#')) return pattern.replace(/#/g, () => randChar()!);
  const suffix = Array.from({ length: 6 }, randChar).join('');
  return `${pattern}${pattern.endsWith('-') ? '' : '-'}${suffix}`;
}

export interface BulkGenerateInput {
  pattern: string; // e.g. "SUMMER-####" or a prefix "WELCOME"
  count: number;
  kind?: string; // discount | percent_discount | bonus_points | free_item
  valueMinor?: number;
  percentOff?: number;
  maxRedemptions?: number;
  perCustomerLimit?: number;
  campaignName?: string;
  startsAt?: string;
  expiresAt?: string;
}

interface ListQuery { q?: string; status?: string; batchId?: string; limit?: number; offset?: number }

@Injectable()
export class CouponService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  async bulkGenerate(ctx: TenantContext, dto: BulkGenerateInput) {
    if (dto.count < 1 || dto.count > 10_000) throw new BadRequestException('count must be 1–10000');
    const batchId = crypto.randomUUID();
    // Generate unique codes in-memory; DB unique([brandId,code]) + skipDuplicates guards the rest.
    const codes = new Set<string>();
    let guard = 0;
    while (codes.size < dto.count && guard < dto.count * 20) {
      codes.add(fromPattern(dto.pattern.trim().toUpperCase()));
      guard += 1;
    }
    const rows = [...codes].map((code) => ({
      brandId: ctx.brandId!,
      groupId: ctx.groupId!,
      platformId: ctx.platformId,
      code,
      batchId,
      campaignName: dto.campaignName ?? null,
      kind: dto.kind ?? 'discount',
      valueMinor: BigInt(dto.valueMinor ?? 0),
      percentOff: dto.percentOff ?? null,
      maxRedemptions: dto.maxRedemptions ?? 1,
      perCustomerLimit: dto.perCustomerLimit ?? 1,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    }));

    return this.tenants.run(ctx, async (tx) => {
      const res = await tx.coupon.createMany({ data: rows, skipDuplicates: true });
      await this.audit.record(tx, ctx, { action: 'coupon.bulk_generate', targetType: 'coupon', targetId: batchId, data: { count: res.count, kind: dto.kind, campaign: dto.campaignName } });
      const sample = await tx.coupon.findMany({ where: { batchId }, select: { code: true }, take: 5 });
      return { batchId, requested: dto.count, created: res.count, sample: sample.map((s) => s.code) };
    });
  }

  async list(ctx: TenantContext, query: ListQuery = {}) {
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.CouponWhereInput = {
        brandId: ctx.brandId!,
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.status && query.status !== 'all' ? { status: query.status as never } : {}),
        ...(query.q ? { OR: [{ code: { contains: query.q, mode: 'insensitive' } }, { campaignName: { contains: query.q, mode: 'insensitive' } }] } : {}),
      };
      const [items, total] = await Promise.all([
        tx.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(query.limit ?? 50, 200), skip: query.offset ?? 0 }),
        tx.coupon.count({ where }),
      ]);
      return {
        rows: items.map((c) => ({
          id: c.id, code: c.code, batchId: c.batchId, campaignName: c.campaignName, kind: c.kind,
          valueMinor: c.valueMinor.toString(), percentOff: c.percentOff, maxRedemptions: c.maxRedemptions,
          perCustomerLimit: c.perCustomerLimit, redeemedCount: c.redeemedCount, status: c.status,
          startsAt: c.startsAt, expiresAt: c.expiresAt,
        })),
        total,
      };
    });
  }

  /** Batch rollup for the UI (one row per generated batch). */
  async batches(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ batch_id: string; campaign_name: string | null; codes: number; redeemed: bigint; created_at: Date }[]>`
        SELECT batch_id, max(campaign_name) AS campaign_name, count(*)::int AS codes,
               coalesce(sum(redeemed_count), 0)::bigint AS redeemed, min(created_at) AS created_at
          FROM coupon WHERE brand_id = ${ctx.brandId} AND batch_id IS NOT NULL
         GROUP BY batch_id ORDER BY min(created_at) DESC`;
      return rows.map((r) => ({ batchId: r.batch_id, campaignName: r.campaign_name, codes: r.codes, redeemed: Number(r.redeemed), createdAt: r.created_at }));
    });
  }

  async update(ctx: TenantContext, id: string, dto: { status?: string; maxRedemptions?: number; perCustomerLimit?: number; expiresAt?: string | null; campaignName?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.coupon.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('coupon not found');
      const c = await tx.coupon.update({
        where: { id },
        data: {
          ...(dto.status !== undefined ? { status: dto.status as never } : {}),
          ...(dto.maxRedemptions !== undefined ? { maxRedemptions: dto.maxRedemptions } : {}),
          ...(dto.perCustomerLimit !== undefined ? { perCustomerLimit: dto.perCustomerLimit } : {}),
          ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
          ...(dto.campaignName !== undefined ? { campaignName: dto.campaignName } : {}),
        },
        select: { id: true, code: true, status: true },
      });
      await this.audit.record(tx, ctx, { action: 'coupon.update', targetType: 'coupon', targetId: id, data: { fields: Object.keys(dto) } });
      return c;
    });
  }

  /** Validate a code for redemption (POS-facing logic; returns reason if invalid). */
  async validate(ctx: TenantContext, code: string, membershipId?: string) {
    return this.tenants.run(ctx, (tx) => this.validateWithTx(tx, ctx, code, membershipId));
  }

  private async validateWithTx(tx: Prisma.TransactionClient, ctx: TenantContext, code: string, membershipId?: string) {
    const coupon = await tx.coupon.findFirst({ where: { brandId: ctx.brandId!, code: code.toUpperCase() } });
    if (!coupon) return { valid: false, reason: 'not_found' as const, coupon: null };
    const now = new Date();
    if (coupon.status !== 'active') return { valid: false, reason: 'inactive' as const, coupon };
    if (coupon.startsAt && coupon.startsAt > now) return { valid: false, reason: 'not_started' as const, coupon };
    if (coupon.expiresAt && coupon.expiresAt < now) return { valid: false, reason: 'expired' as const, coupon };
    if (coupon.redeemedCount >= coupon.maxRedemptions) return { valid: false, reason: 'exhausted' as const, coupon };
    if (membershipId) {
      const used = await tx.couponRedemption.count({ where: { couponId: coupon.id, membershipId } });
      if (used >= coupon.perCustomerLimit) return { valid: false, reason: 'per_customer_limit' as const, coupon };
    }
    return { valid: true as const, reason: null, coupon };
  }

  async redeem(ctx: TenantContext, code: string, membershipId?: string) {
    return this.tenants.run(ctx, async (tx) => {
      const check = await this.validateWithTx(tx, ctx, code, membershipId);
      if (!check.valid || !check.coupon) throw new BadRequestException(`coupon ${check.reason ?? 'invalid'}`);
      const c = check.coupon;
      await tx.coupon.update({ where: { id: c.id }, data: { redeemedCount: { increment: 1 } } });
      await tx.couponRedemption.create({ data: { couponId: c.id, brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, membershipId: membershipId ?? null } });
      await this.audit.record(tx, ctx, { action: 'coupon.redeem', targetType: 'coupon', targetId: c.id, data: { code: c.code } });
      return { redeemed: true, code: c.code, effect: { kind: c.kind, valueMinor: c.valueMinor.toString(), percentOff: c.percentOff } };
    });
  }

  async exportCsv(ctx: TenantContext, batchId?: string): Promise<string> {
    const { rows } = await this.list(ctx, { batchId, limit: 10_000 });
    const header = 'code,kind,valueMinor,percentOff,maxRedemptions,redeemedCount,status,expiresAt';
    const body = rows.map((c) => [c.code, c.kind, c.valueMinor, c.percentOff ?? '', c.maxRedemptions, c.redeemedCount, c.status, c.expiresAt ? new Date(c.expiresAt).toISOString() : ''].join(',')).join('\n');
    return `${header}\n${body}\n`;
  }
}
