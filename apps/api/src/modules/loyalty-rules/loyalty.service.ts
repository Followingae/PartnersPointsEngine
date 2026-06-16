import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ledger, Prisma } from '@rfm-loyalty/db';
import { EarnRule, evaluateEarn, pointsAsset, type EarnContext, type TenantContext } from '@rfm-loyalty/shared';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { CampaignService } from './campaign.service';
import { GamificationService } from './gamification.service';
import { sortClause, type ListQuery, type ListResult } from './list';

export interface EarnInput {
  membershipId: string;
  amountMinor?: number;
  channel?: 'online' | 'in_store';
  isVisit?: boolean;
  items?: Array<{ sku: string; qty: number }>;
  sourceEvent?: string;
  idempotencyKey: string;
}

const POINTS_LIABILITY = 'points_liability';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly tenants: TenantService,
    private readonly campaigns: CampaignService,
    private readonly gamification: GamificationService,
    private readonly audit: AuditService,
    private readonly crypto: EnvelopeCryptoService,
  ) {}

  /** Safely decrypt an optional envelope-encrypted PII blob to a string (or null). */
  private reveal(blob: Uint8Array | null | undefined): string | null {
    if (!blob) return null;
    try { return this.crypto.decrypt(blob); } catch { return null; }
  }

  /** Resolve the calling customer's membership id for the current brand. */
  async resolveCustomerMembership(ctx: TenantContext): Promise<string> {
    return this.tenants.run(ctx, async (tx) => {
      const m = await tx.customerMembership.findUnique({
        where: { personId_brandId: { personId: ctx.actor.id, brandId: ctx.brandId! } },
        select: { id: true },
      });
      if (!m) throw new NotFoundException('membership not found for this brand');
      return m.id;
    });
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  private async findLiabilityAccount(tx: Prisma.TransactionClient, ctx: TenantContext, membershipId: string) {
    return tx.ledgerAccount.findFirst({
      where: {
        ledger: 'points',
        accountType: POINTS_LIABILITY,
        brandId: ctx.brandId,
        customerId: membershipId,
        assetCode: pointsAsset(ctx.brandId!),
      },
      select: { id: true },
    });
  }

  private async lifetimeAndTier(tx: Prisma.TransactionClient, ctx: TenantContext, membershipId: string) {
    const acc = await this.findLiabilityAccount(tx, ctx, membershipId);
    let lifetime = 0n;
    if (acc) {
      const rows = await tx.$queryRaw<{ c: bigint }[]>`
        SELECT posted_credits AS c FROM account_balance WHERE account_id = ${acc.id}`;
      lifetime = rows[0] ? BigInt(rows[0].c) : 0n;
    }
    const tiers = await tx.tier.findMany({ where: { brandId: ctx.brandId! }, orderBy: { threshold: 'desc' } });
    const tier = tiers.find((t) => lifetime >= t.threshold) ?? null;
    return { accountId: acc?.id ?? null, lifetime, tier };
  }

  async balance(ctx: TenantContext, membershipId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const { accountId, lifetime, tier } = await this.lifetimeAndTier(tx, ctx, membershipId);
      const bal = accountId ? await ledger.getBalance(tx, accountId) : { posted: 0n, pending: 0n, available: 0n };
      return {
        available: bal.available.toString(),
        pending: bal.pending.toString(),
        lifetime: lifetime.toString(),
        tier: tier ? { id: tier.id, name: tier.name } : null,
      };
    });
  }

  async history(ctx: TenantContext, membershipId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const acc = await this.findLiabilityAccount(tx, ctx, membershipId);
      if (!acc) return [];
      const rows = await tx.$queryRaw<
        { id: string; kind: string; direction: string; amount_minor: bigint; occurred_at: Date; point_state: string | null }[]
      >`
        SELECT j.id, j.kind, e.direction, e.amount_minor, j.occurred_at, e.point_state
          FROM entry e JOIN journal j ON j.id = e.journal_id
         WHERE e.account_id = ${acc.id}
         ORDER BY j.occurred_at DESC, j.id DESC
         LIMIT 50`;
      return rows.map((r) => ({
        journalId: r.id,
        kind: r.kind,
        direction: r.direction,
        amount: r.amount_minor.toString(),
        occurredAt: r.occurred_at,
        pointState: r.point_state,
      }));
    });
  }

  async catalog(ctx: TenantContext) {
    return this.tenants.run(ctx, (tx) =>
      tx.rewardCatalogItem.findMany({
        where: { brandId: ctx.brandId!, status: 'active' },
        select: { id: true, name: true, description: true, pointsCost: true, kind: true },
        orderBy: { pointsCost: 'asc' },
      }),
    ).then((items) => items.map((i) => ({ ...i, pointsCost: i.pointsCost.toString() })));
  }

  // ── writes ─────────────────────────────────────────────────────────────────

  /** Evaluate brand earn rules for a transaction and award points via the ledger. */
  async earn(ctx: TenantContext, input: EarnInput) {
    return this.tenants.run(ctx, (tx) => this.earnWithTx(tx, ctx, input));
  }

  /** Earn within an existing transaction (so callers like the terminal gateway compose atomically). */
  async earnWithTx(tx: Prisma.TransactionClient, ctx: TenantContext, input: EarnInput) {
    {
      const ruleRows = await tx.loyaltyEarnRule.findMany({
        where: { brandId: ctx.brandId!, enabled: true },
        orderBy: { priority: 'asc' },
      });
      const rules: EarnRule[] = ruleRows.map((r) => {
        const def = (r.definition ?? {}) as { condition?: unknown; actions?: unknown; channel?: 'online' | 'in_store' };
        return EarnRule.parse({
          id: r.id,
          name: r.name,
          priority: r.priority,
          enabled: r.enabled,
          channel: def.channel,
          condition: def.condition,
          actions: def.actions ?? [],
        });
      });
      // Merge in active time-boxed campaign rules (evaluated by the same engine).
      rules.push(...(await this.campaigns.activeRules(tx, ctx)));

      const { tier } = await this.lifetimeAndTier(tx, ctx, input.membershipId);
      const evalCtx: EarnContext = {
        session: { amountMinor: input.amountMinor, isVisit: input.isVisit, channel: input.channel },
        profile: { tier: tier?.name },
        items: input.items,
      };
      const decision = evaluateEarn(rules, evalCtx);
      if (decision.points <= 0) {
        return { decision, journalId: null, balance: null, gamification: { completedChallengeIds: [] } };
      }
      const result = await ledger.earnPoints(tx, {
        scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: input.membershipId },
        points: BigInt(decision.points),
        occurredAt: new Date(),
        sourceEvent: input.sourceEvent,
        channel: input.channel ?? null,
        idem: { actorId: ctx.actor.id, key: input.idempotencyKey },
        // Default 12-month rolling expiry (configurable per brand in a later pass).
        expiryBucket: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
      // Evaluate gamification on the updated lifetime (badges/challenges), same tx.
      const { lifetime } = await this.lifetimeAndTier(tx, ctx, input.membershipId);
      const gamification = await this.gamification.onEarnWithTx(tx, ctx, input.membershipId, lifetime);
      return {
        decision,
        journalId: result.journalId,
        balance: { available: result.balance.available.toString() },
        gamification,
      };
    }
  }

  // ── brand-admin config ───────────────────────────────────────────────────

  async createEarnRule(ctx: TenantContext, dto: { name: string; priority?: number; enabled?: boolean; definition: Record<string, unknown> }) {
    // Validate the definition against the engine schema before persisting.
    EarnRule.parse({ id: 'preview', name: dto.name, priority: dto.priority ?? 0, enabled: dto.enabled ?? true, channel: dto.definition.channel as 'online' | 'in_store' | undefined, condition: dto.definition.condition, actions: dto.definition.actions ?? [] });
    return this.tenants.run(ctx, async (tx) => {
      const rule = await tx.loyaltyEarnRule.create({
        data: {
          brandId: ctx.brandId!,
          groupId: ctx.groupId!,
          platformId: ctx.platformId,
          name: dto.name,
          priority: dto.priority ?? 0,
          enabled: dto.enabled ?? true,
          definition: dto.definition as Prisma.InputJsonValue,
        },
        select: { id: true, name: true, priority: true, enabled: true },
      });
      await this.audit.record(tx, ctx, { action: 'earn_rule.create', targetType: 'earn_rule', targetId: rule.id, data: { name: rule.name } });
      return rule;
    });
  }

  async listEarnRules(ctx: TenantContext, query: ListQuery = {}) {
    const { sort, order } = sortClause(query, ['name', 'priority', 'createdAt', 'updatedAt'], 'priority', 'asc');
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.LoyaltyEarnRuleWhereInput = {
        brandId: ctx.brandId!,
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
        ...(query.status === 'enabled' ? { enabled: true } : query.status === 'disabled' ? { enabled: false } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.loyaltyEarnRule.findMany({ where, orderBy: { [sort]: order }, take: query.limit ?? 100, skip: query.offset ?? 0 }),
        tx.loyaltyEarnRule.count({ where }),
      ]);
      return { rows, total } satisfies ListResult<unknown>;
    });
  }

  async getEarnRule(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const rule = await tx.loyaltyEarnRule.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!rule) throw new NotFoundException('earn rule not found');
      return rule;
    });
  }

  async updateEarnRule(ctx: TenantContext, id: string, dto: { name?: string; priority?: number; enabled?: boolean; definition?: Record<string, unknown> }) {
    if (dto.definition) {
      EarnRule.parse({ id: 'preview', name: dto.name ?? 'preview', priority: dto.priority ?? 0, enabled: dto.enabled ?? true, channel: dto.definition.channel as 'online' | 'in_store' | undefined, condition: dto.definition.condition, actions: dto.definition.actions ?? [] });
    }
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.loyaltyEarnRule.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('earn rule not found');
      const updated = await tx.loyaltyEarnRule.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.definition !== undefined ? { definition: dto.definition as Prisma.InputJsonValue } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'earn_rule.update', targetType: 'earn_rule', targetId: id, data: { fields: Object.keys(dto) } });
      return updated;
    });
  }

  async deleteEarnRule(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.loyaltyEarnRule.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundException('earn rule not found');
      await tx.loyaltyEarnRule.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'earn_rule.delete', targetType: 'earn_rule', targetId: id, data: { name: existing.name } });
      return { id, deleted: true };
    });
  }

  async cloneEarnRule(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const src = await tx.loyaltyEarnRule.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!src) throw new NotFoundException('earn rule not found');
      const copy = await tx.loyaltyEarnRule.create({
        data: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, name: `${src.name} (copy)`, priority: src.priority, enabled: false, definition: src.definition as Prisma.InputJsonValue },
      });
      await this.audit.record(tx, ctx, { action: 'earn_rule.clone', targetType: 'earn_rule', targetId: copy.id, data: { from: id } });
      return copy;
    });
  }

  async listCampaigns(ctx: TenantContext) {
    return this.tenants.run(ctx, (tx) =>
      tx.campaign.findMany({ where: { brandId: ctx.brandId! }, orderBy: { createdAt: 'desc' } }),
    );
  }

  async listTiers(ctx: TenantContext, query: ListQuery = {}) {
    const { sort, order } = sortClause(query, ['name', 'threshold', 'multiplierBps'], 'threshold', 'asc');
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.TierWhereInput = { brandId: ctx.brandId!, ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}) };
      const [items, total] = await Promise.all([
        tx.tier.findMany({ where, orderBy: { [sort]: order }, take: query.limit ?? 100, skip: query.offset ?? 0 }),
        tx.tier.count({ where }),
      ]);
      return { rows: items.map((t) => ({ ...t, threshold: t.threshold.toString() })), total } satisfies ListResult<unknown>;
    });
  }

  async getTier(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const t = await tx.tier.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!t) throw new NotFoundException('tier not found');
      return { ...t, threshold: t.threshold.toString() };
    });
  }

  async updateTier(ctx: TenantContext, id: string, dto: { name?: string; threshold?: number; multiplierBps?: number; benefits?: Record<string, unknown> }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.tier.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('tier not found');
      const t = await tx.tier.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.threshold !== undefined ? { threshold: BigInt(dto.threshold) } : {}),
          ...(dto.multiplierBps !== undefined ? { multiplierBps: dto.multiplierBps } : {}),
          ...(dto.benefits !== undefined ? { benefits: dto.benefits as Prisma.InputJsonValue } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'tier.update', targetType: 'tier', targetId: id, data: { fields: Object.keys(dto) } });
      return { ...t, threshold: t.threshold.toString() };
    });
  }

  async deleteTier(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.tier.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundException('tier not found');
      await tx.tier.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'tier.delete', targetType: 'tier', targetId: id, data: { name: existing.name } });
      return { id, deleted: true };
    });
  }

  async listRewards(ctx: TenantContext, query: ListQuery = {}) {
    const { sort, order } = sortClause(query, ['name', 'pointsCost', 'createdAt'], 'pointsCost', 'asc');
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.RewardCatalogItemWhereInput = {
        brandId: ctx.brandId!,
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
        ...(query.status && query.status !== 'all' ? { status: query.status as never } : { status: { not: 'archived' } }),
      };
      const [items, total] = await Promise.all([
        tx.rewardCatalogItem.findMany({ where, orderBy: { [sort]: order }, take: query.limit ?? 100, skip: query.offset ?? 0 }),
        tx.rewardCatalogItem.count({ where }),
      ]);
      const rows = items.map((r) => ({ id: r.id, name: r.name, description: r.description, pointsCost: r.pointsCost.toString(), kind: r.kind, status: r.status }));
      return { rows, total } satisfies ListResult<unknown>;
    });
  }

  async getReward(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const r = await tx.rewardCatalogItem.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!r) throw new NotFoundException('reward not found');
      return { id: r.id, name: r.name, description: r.description, pointsCost: r.pointsCost.toString(), kind: r.kind, status: r.status, payload: r.payload };
    });
  }

  async updateReward(ctx: TenantContext, id: string, dto: { name?: string; description?: string | null; pointsCost?: number; kind?: string; status?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.rewardCatalogItem.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('reward not found');
      const r = await tx.rewardCatalogItem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.pointsCost !== undefined ? { pointsCost: BigInt(dto.pointsCost) } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'reward.update', targetType: 'reward_catalog_item', targetId: id, data: { fields: Object.keys(dto) } });
      return { id: r.id, name: r.name, pointsCost: r.pointsCost.toString(), kind: r.kind, status: r.status };
    });
  }

  /** Rewards are soft-deleted (archived) — issued vouchers reference the catalog item. */
  async deleteReward(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.rewardCatalogItem.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundException('reward not found');
      await tx.rewardCatalogItem.update({ where: { id }, data: { status: 'archived' } });
      await this.audit.record(tx, ctx, { action: 'reward.archive', targetType: 'reward_catalog_item', targetId: id, data: { name: existing.name } });
      return { id, archived: true };
    });
  }

  async cloneReward(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const src = await tx.rewardCatalogItem.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!src) throw new NotFoundException('reward not found');
      const copy = await tx.rewardCatalogItem.create({
        data: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, name: `${src.name} (copy)`, description: src.description, pointsCost: src.pointsCost, kind: src.kind, payload: src.payload as Prisma.InputJsonValue },
      });
      await this.audit.record(tx, ctx, { action: 'reward.clone', targetType: 'reward_catalog_item', targetId: copy.id, data: { from: id } });
      return { id: copy.id, name: copy.name, pointsCost: copy.pointsCost.toString(), kind: copy.kind, status: copy.status };
    });
  }

  async listMembers(ctx: TenantContext, query: ListQuery = {}) {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;
    const sortCol = { available: 'available', lifetime: 'lifetime', joinedAt: 'm.joined_at', loyaltyId: 'm.loyalty_id' }[query.sort ?? 'available'] ?? 'available';
    const orderDir = query.order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const filters: Prisma.Sql[] = [Prisma.sql`m.brand_id = ${ctx.brandId}`];
    if (query.q) filters.push(Prisma.sql`m.loyalty_id ILIKE ${'%' + query.q + '%'}`);
    if (query.status && query.status !== 'all') filters.push(Prisma.sql`m.status = ${query.status}::entity_status`);
    const where = Prisma.join(filters, ' AND ');
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; loyalty_id: string; status: string; available: bigint; lifetime: bigint; joined_at: Date }[]
      >`
        SELECT m.id, m.loyalty_id, m.status, m.joined_at,
               coalesce(ab.posted_credits - ab.posted_debits - ab.pending_debits, 0)::bigint AS available,
               coalesce(ab.posted_credits, 0)::bigint AS lifetime
          FROM customer_membership m
          LEFT JOIN ledger_account la ON la.brand_id = m.brand_id AND la.customer_id = m.id AND la.account_type = 'points_liability'
          LEFT JOIN account_balance ab ON ab.account_id = la.id
         WHERE ${where}
         ORDER BY ${Prisma.raw(sortCol)} ${orderDir} NULLS LAST
         LIMIT ${limit} OFFSET ${offset}`;
      const totalRows = await tx.$queryRaw<{ c: bigint }[]>`SELECT count(*)::bigint AS c FROM customer_membership m WHERE ${where}`;
      return {
        rows: rows.map((r) => ({
          membershipId: r.id,
          loyaltyId: r.loyalty_id,
          status: r.status,
          available: r.available.toString(),
          lifetime: r.lifetime.toString(),
          joinedAt: r.joined_at,
        })),
        total: Number(totalRows[0]?.c ?? 0n),
      } satisfies ListResult<unknown>;
    });
  }

  // ── GDPR (W7): subject data export + erasure ─────────────────────────────────

  /** Full data-subject export (the 360 payload is the customer's data of record). */
  async exportCustomer(ctx: TenantContext, membershipId: string) {
    const profile = await this.customerProfile(ctx, membershipId);
    return { exportedAt: new Date().toISOString(), ...profile };
  }

  /** Right-to-be-forgotten: archive the membership (closed-loop scope). */
  async eraseCustomer(ctx: TenantContext, membershipId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const m = await tx.customerMembership.findFirst({ where: { id: membershipId, brandId: ctx.brandId! }, select: { id: true } });
      if (!m) throw new NotFoundException('member not found');
      await tx.customerMembership.update({ where: { id: membershipId }, data: { status: 'archived' } });
      await this.audit.record(tx, ctx, { action: 'customer.erase', targetType: 'customer_membership', targetId: membershipId });
      return { membershipId, erased: true };
    });
  }

  // ── brand settings ─────────────────────────────────────────────────────────

  /** The brand's own module entitlements (drives nav visibility); superadmin-controlled. */
  async getModuleAccess(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const b = await tx.brand.findFirst({ where: { id: ctx.brandId! }, select: { moduleAccess: true } });
      return { access: (b?.moduleAccess ?? {}) as Record<string, boolean> };
    });
  }

  async getSettings(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const b = await tx.brand.findFirst({
        where: { id: ctx.brandId! },
        select: { id: true, name: true, slug: true, pointsCurrencyCode: true, currency: true, branding: true, status: true },
      });
      if (!b) throw new NotFoundException('brand not found');
      return { ...b, branding: (b.branding ?? {}) as Record<string, unknown> };
    });
  }

  async updateSettings(ctx: TenantContext, dto: { name?: string; pointsCurrencyCode?: string; currency?: string; branding?: Record<string, unknown> }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.brand.findFirst({ where: { id: ctx.brandId! }, select: { id: true, branding: true } });
      if (!existing) throw new NotFoundException('brand not found');
      const mergedBranding = dto.branding ? { ...(existing.branding as Record<string, unknown>), ...dto.branding } : undefined;
      const b = await tx.brand.update({
        where: { id: ctx.brandId! },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.pointsCurrencyCode !== undefined ? { pointsCurrencyCode: dto.pointsCurrencyCode } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(mergedBranding !== undefined ? { branding: mergedBranding as Prisma.InputJsonValue } : {}),
        },
        select: { id: true, name: true, pointsCurrencyCode: true, currency: true, branding: true },
      });
      await this.audit.record(tx, ctx, { action: 'brand.settings.update', targetType: 'brand', targetId: b.id, data: { fields: Object.keys(dto) } });
      return { ...b, branding: (b.branding ?? {}) as Record<string, unknown> };
    });
  }

  async listAuditLogs(ctx: TenantContext, query: ListQuery = {}) {
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.AuditLogWhereInput = {
        brandId: ctx.brandId!,
        ...(query.q ? { action: { contains: query.q, mode: 'insensitive' } } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(query.limit ?? 50, 200), skip: query.offset ?? 0, select: { id: true, actorType: true, actorId: true, action: true, targetType: true, targetId: true, data: true, createdAt: true } }),
        tx.auditLog.count({ where }),
      ]);
      return { rows, total } satisfies ListResult<unknown>;
    });
  }

  /** Customer 360 — single payload powering the member detail drawer. */
  async customerProfile(ctx: TenantContext, membershipId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const m = await tx.customerMembership.findFirst({
        where: { id: membershipId, brandId: ctx.brandId! },
        include: {
          identifiers: { select: { type: true, createdAt: true } },
          person: { select: { fullName: true, gender: true, birthdate: true, phoneEnc: true, emailEnc: true } },
        },
      });
      if (!m) throw new NotFoundException('member not found');

      const { accountId, lifetime, tier } = await this.lifetimeAndTier(tx, ctx, membershipId);
      const bal = accountId ? await ledger.getBalance(tx, accountId) : { posted: 0n, pending: 0n, available: 0n };

      // next tier + progress %
      const tiers = await tx.tier.findMany({ where: { brandId: ctx.brandId! }, orderBy: { threshold: 'asc' } });
      const nextTier = tiers.find((t) => t.threshold > lifetime) ?? null;
      const tierFloor = tier ? (tiers.find((t) => t.id === tier.id)?.threshold ?? 0n) : 0n;
      const progressPct = nextTier && nextTier.threshold > tierFloor
        ? Math.min(100, Math.round(Number((lifetime - tierFloor) * 100n / (nextTier.threshold - tierFloor))))
        : 100;

      const txns = accountId
        ? await tx.$queryRaw<{ id: string; kind: string; direction: string; amount_minor: bigint; occurred_at: Date; point_state: string | null }[]>`
            SELECT j.id, j.kind, e.direction, e.amount_minor, j.occurred_at, e.point_state
              FROM entry e JOIN journal j ON j.id = e.journal_id
             WHERE e.account_id = ${accountId}
             ORDER BY j.occurred_at DESC, j.id DESC LIMIT 25`
        : [];

      const badges = await tx.badgeAward.findMany({ where: { membershipId, brandId: ctx.brandId! }, include: { badge: { select: { name: true, icon: true } } }, orderBy: { awardedAt: 'desc' } });
      const referralsMade = await tx.referral.count({ where: { referrerMembershipId: membershipId, brandId: ctx.brandId! } });
      const referralsQualified = await tx.referral.count({ where: { referrerMembershipId: membershipId, brandId: ctx.brandId!, status: 'qualified' } });

      return {
        membershipId: m.id,
        loyaltyId: m.loyaltyId,
        status: m.status,
        joinedAt: m.joinedAt,
        contact: {
          fullName: m.person?.fullName ?? null,
          phone: this.reveal(m.person?.phoneEnc),
          email: this.reveal(m.person?.emailEnc),
          gender: m.person?.gender ?? null,
          birthdate: m.person?.birthdate ? m.person.birthdate.toISOString().slice(0, 10) : null,
        },
        balance: { available: bal.available.toString(), pending: bal.pending.toString(), lifetime: lifetime.toString() },
        tier: tier ? { id: tier.id, name: tier.name } : null,
        nextTier: nextTier ? { name: nextTier.name, threshold: nextTier.threshold.toString() } : null,
        progressPct,
        identifiers: m.identifiers.map((i) => ({ type: i.type, addedAt: i.createdAt })),
        transactions: txns.map((r) => ({ journalId: r.id, kind: r.kind, direction: r.direction, amount: r.amount_minor.toString(), occurredAt: r.occurred_at, pointState: r.point_state })),
        badges: badges.map((a) => ({ name: a.badge.name, icon: a.badge.icon, awardedAt: a.awardedAt })),
        referrals: { made: referralsMade, qualified: referralsQualified },
      };
    });
  }

  /** Edit a customer's profile attributes the merchant maintains (name, gender, birthdate). */
  async updateCustomerProfile(ctx: TenantContext, membershipId: string, dto: { fullName?: string; gender?: string; birthdate?: string | null }) {
    return this.tenants.run(ctx, async (tx) => {
      const m = await tx.customerMembership.findFirst({ where: { id: membershipId, brandId: ctx.brandId! }, select: { personId: true } });
      if (!m) throw new NotFoundException('member not found');
      await tx.person.update({
        where: { id: m.personId },
        data: {
          ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() || null } : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender || null } : {}),
          ...(dto.birthdate !== undefined ? { birthdate: dto.birthdate ? new Date(dto.birthdate) : null } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'customer.profile.update', targetType: 'customer', targetId: membershipId, data: { fields: Object.keys(dto) } });
      return { membershipId, updated: true };
    });
  }

  async createCatalogItem(ctx: TenantContext, dto: { name: string; description?: string; pointsCost: number; kind?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const i = await tx.rewardCatalogItem.create({
        data: {
          brandId: ctx.brandId!,
          groupId: ctx.groupId!,
          platformId: ctx.platformId,
          name: dto.name,
          description: dto.description ?? null,
          pointsCost: BigInt(dto.pointsCost),
          kind: dto.kind ?? 'voucher',
        },
        select: { id: true, name: true, pointsCost: true, kind: true },
      });
      await this.audit.record(tx, ctx, { action: 'reward.create', targetType: 'reward_catalog_item', targetId: i.id, data: { name: i.name } });
      return { ...i, pointsCost: i.pointsCost.toString() };
    });
  }

  async createTier(ctx: TenantContext, dto: { name: string; threshold: number; multiplierBps?: number }) {
    return this.tenants.run(ctx, async (tx) => {
      const t = await tx.tier.create({
        data: {
          brandId: ctx.brandId!,
          groupId: ctx.groupId!,
          platformId: ctx.platformId,
          name: dto.name,
          threshold: BigInt(dto.threshold),
          multiplierBps: dto.multiplierBps ?? 10000,
        },
        select: { id: true, name: true, threshold: true, multiplierBps: true },
      });
      await this.audit.record(tx, ctx, { action: 'tier.create', targetType: 'tier', targetId: t.id, data: { name: t.name } });
      return { ...t, threshold: t.threshold.toString() };
    });
  }

  /** Redeem a catalog item: burn points (authorize→capture) and issue a voucher. */
  async redeem(ctx: TenantContext, membershipId: string, catalogItemId: string, idempotencyKey: string) {
    return this.tenants.run(ctx, async (tx) => {
      const item = await tx.rewardCatalogItem.findFirst({
        where: { id: catalogItemId, brandId: ctx.brandId!, status: 'active' },
      });
      if (!item) throw new NotFoundException('reward not found');

      const points = item.pointsCost;
      const redeemArgs = {
        scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: membershipId },
        points,
        occurredAt: new Date(),
        sourceEvent: `redeem:${catalogItemId}`,
        channel: 'online' as const, // catalog redemption flows through the online surface
        idem: { actorId: ctx.actor.id, key: idempotencyKey },
      };

      try {
        await ledger.authorizeRedeem(tx, { ...redeemArgs, idem: { actorId: ctx.actor.id, key: `${idempotencyKey}:auth` } });
        const cap = await ledger.captureRedeem(tx, { ...redeemArgs, idem: { actorId: ctx.actor.id, key: `${idempotencyKey}:cap` } });

        const voucher = await tx.voucher.create({
          data: {
            brandId: ctx.brandId!,
            groupId: ctx.groupId!,
            platformId: ctx.platformId,
            catalogItemId: item.id,
            membershipId,
            code: randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
            pointsSpent: points,
            redeemJournalId: cap.journalId,
          },
          select: { id: true, code: true, status: true, pointsSpent: true },
        });
        return { voucher: { ...voucher, pointsSpent: voucher.pointsSpent.toString() } };
      } catch (e) {
        if (e instanceof ledger.LedgerError && e.code === 'insufficient_balance') {
          throw new BadRequestException('insufficient points');
        }
        throw e;
      }
    });
  }

  /** Redeem an issued voucher (mark used). */
  async redeemVoucher(ctx: TenantContext, code: string, membershipId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const v = await tx.voucher.findUnique({ where: { code } });
      if (!v || v.brandId !== ctx.brandId) throw new NotFoundException('voucher not found');
      if (v.membershipId !== membershipId) throw new BadRequestException('voucher belongs to another member');
      if (v.expiresAt && v.expiresAt < new Date()) {
        await tx.voucher.update({ where: { id: v.id }, data: { status: 'expired' } });
        throw new BadRequestException('voucher expired');
      }
      if (v.status !== 'issued') throw new BadRequestException(`voucher is ${v.status}`);
      await tx.voucher.update({ where: { id: v.id }, data: { status: 'redeemed', redeemedAt: new Date() } });
      return { code: v.code, status: 'redeemed' };
    });
  }
}
