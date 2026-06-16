import { Injectable, NotFoundException } from '@nestjs/common';
import { ledger, type Prisma } from '@rfm-loyalty/db';
import { pointsAsset, type TenantContext } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { sortClause, type ListQuery, type ListResult } from './list';

/**
 * Gamification (Phase 5): lifetime-points challenges that award a badge + bonus
 * points when crossed (one-time, idempotent). Bonus earns are tagged so they
 * don't recursively re-trigger challenge evaluation. Plus a brand leaderboard.
 */
@Injectable()
export class GamificationService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /** Evaluate lifetime-points challenges after an earn (within the earn tx). */
  async onEarnWithTx(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    membershipId: string,
    lifetime: bigint,
  ): Promise<{ completedChallengeIds: string[] }> {
    const challenges = await tx.challenge.findMany({
      where: { brandId: ctx.brandId!, enabled: true, kind: 'lifetime_points' },
    });
    const completed: string[] = [];
    for (const ch of challenges) {
      if (lifetime < ch.target) continue;
      const existing = await tx.challengeProgress.findUnique({
        where: { challengeId_membershipId: { challengeId: ch.id, membershipId } },
      });
      if (existing?.completedAt) continue;
      await tx.challengeProgress.upsert({
        where: { challengeId_membershipId: { challengeId: ch.id, membershipId } },
        update: { progress: lifetime, completedAt: new Date() },
        create: {
          brandId: ctx.brandId!,
          groupId: ctx.groupId!,
          platformId: ctx.platformId,
          challengeId: ch.id,
          membershipId,
          progress: lifetime,
          completedAt: new Date(),
        },
      });
      if (ch.rewardPoints > 0n) await this.bonus(tx, ctx, membershipId, ch.rewardPoints, `challenge:${ch.id}`);
      if (ch.badgeId) await this.awardBadge(tx, ctx, membershipId, ch.badgeId);
      completed.push(ch.id);
    }
    return { completedChallengeIds: completed };
  }

  async awardBadge(tx: Prisma.TransactionClient, ctx: TenantContext, membershipId: string, badgeId: string): Promise<void> {
    const existing = await tx.badgeAward.findUnique({ where: { badgeId_membershipId: { badgeId, membershipId } } });
    if (existing) return;
    const badge = await tx.badge.findUnique({ where: { id: badgeId } });
    let journalId: string | null = null;
    if (badge && badge.rewardPoints > 0n) {
      journalId = await this.bonus(tx, ctx, membershipId, badge.rewardPoints, `badge:${badgeId}`);
    }
    await tx.badgeAward.create({
      data: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, badgeId, membershipId, journalId },
    });
  }

  private async bonus(tx: Prisma.TransactionClient, ctx: TenantContext, membershipId: string, points: bigint, source: string): Promise<string> {
    const r = await ledger.earnPoints(tx, {
      scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: membershipId },
      points,
      occurredAt: new Date(),
      sourceEvent: source,
      idem: { actorId: ctx.actor.id, key: `gami:${source}:${membershipId}` },
    });
    return r.journalId;
  }

  // ── reads + config ───────────────────────────────────────────────────────

  async badges(ctx: TenantContext, membershipId: string) {
    return this.tenants.run(ctx, (tx) =>
      tx.badgeAward.findMany({ where: { membershipId, brandId: ctx.brandId! }, include: { badge: { select: { name: true, icon: true } } } }),
    ).then((rows) => rows.map((a) => ({ name: a.badge.name, icon: a.badge.icon, awardedAt: a.awardedAt })));
  }

  async leaderboard(ctx: TenantContext, limit = 10) {
    return this.tenants.run(ctx, (tx) =>
      tx.$queryRaw<{ customer_id: string; lifetime: bigint }[]>`
        SELECT la.customer_id, ab.posted_credits AS lifetime
          FROM ledger_account la JOIN account_balance ab ON ab.account_id = la.id
         WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
         ORDER BY ab.posted_credits DESC
         LIMIT ${limit}`,
    ).then((rows) => rows.map((r, i) => ({ rank: i + 1, membershipId: r.customer_id, lifetime: r.lifetime.toString() })));
  }

  async createBadge(ctx: TenantContext, dto: { name: string; description?: string; icon?: string; rewardPoints?: number }) {
    return this.tenants.run(ctx, async (tx) => {
      const b = await tx.badge.create({
        data: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, name: dto.name, description: dto.description ?? null, icon: dto.icon ?? null, rewardPoints: BigInt(dto.rewardPoints ?? 0) },
        select: { id: true, name: true },
      });
      await this.audit.record(tx, ctx, { action: 'badge.create', targetType: 'badge', targetId: b.id, data: { name: b.name } });
      return b;
    });
  }

  async createChallenge(ctx: TenantContext, dto: { name: string; kind?: string; target: number; rewardPoints?: number; badgeId?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const c = await tx.challenge.create({
        data: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, name: dto.name, kind: dto.kind ?? 'lifetime_points', target: BigInt(dto.target), rewardPoints: BigInt(dto.rewardPoints ?? 0), badgeId: dto.badgeId ?? null },
        select: { id: true, name: true, target: true },
      });
      await this.audit.record(tx, ctx, { action: 'challenge.create', targetType: 'challenge', targetId: c.id, data: { name: c.name } });
      return { ...c, target: c.target.toString() };
    });
  }

  async listBadgesCatalog(ctx: TenantContext, query: ListQuery = {}) {
    const { sort, order } = sortClause(query, ['name', 'createdAt', 'rewardPoints'], 'createdAt', 'desc');
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.BadgeWhereInput = { brandId: ctx.brandId!, ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}) };
      const [items, total] = await Promise.all([
        tx.badge.findMany({ where, orderBy: { [sort]: order }, take: query.limit ?? 100, skip: query.offset ?? 0 }),
        tx.badge.count({ where }),
      ]);
      return { rows: items.map((b) => ({ id: b.id, name: b.name, description: b.description, icon: b.icon, rewardPoints: b.rewardPoints.toString() })), total } satisfies ListResult<unknown>;
    });
  }

  async listChallenges(ctx: TenantContext, query: ListQuery = {}) {
    const { sort, order } = sortClause(query, ['name', 'target', 'createdAt'], 'target', 'asc');
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.ChallengeWhereInput = {
        brandId: ctx.brandId!,
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
        ...(query.status === 'enabled' ? { enabled: true } : query.status === 'disabled' ? { enabled: false } : {}),
      };
      const [items, total] = await Promise.all([
        tx.challenge.findMany({ where, orderBy: { [sort]: order }, take: query.limit ?? 100, skip: query.offset ?? 0 }),
        tx.challenge.count({ where }),
      ]);
      return { rows: items.map((c) => ({ id: c.id, name: c.name, kind: c.kind, target: c.target.toString(), rewardPoints: c.rewardPoints.toString(), badgeId: c.badgeId, enabled: c.enabled })), total } satisfies ListResult<unknown>;
    });
  }

  // ── badge CRUD ─────────────────────────────────────────────────────────────

  async getBadge(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const b = await tx.badge.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!b) throw new NotFoundException('badge not found');
      return { id: b.id, name: b.name, description: b.description, icon: b.icon, rewardPoints: b.rewardPoints.toString() };
    });
  }

  async updateBadge(ctx: TenantContext, id: string, dto: { name?: string; description?: string | null; icon?: string | null; rewardPoints?: number }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.badge.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('badge not found');
      const b = await tx.badge.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(dto.rewardPoints !== undefined ? { rewardPoints: BigInt(dto.rewardPoints) } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'badge.update', targetType: 'badge', targetId: id, data: { fields: Object.keys(dto) } });
      return { id: b.id, name: b.name, rewardPoints: b.rewardPoints.toString() };
    });
  }

  /** Deleting a badge cascades its awards (onDelete: Cascade). */
  async deleteBadge(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.badge.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundException('badge not found');
      await tx.badge.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'badge.delete', targetType: 'badge', targetId: id, data: { name: existing.name } });
      return { id, deleted: true };
    });
  }

  // ── challenge CRUD ─────────────────────────────────────────────────────────

  async getChallenge(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const c = await tx.challenge.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!c) throw new NotFoundException('challenge not found');
      return { id: c.id, name: c.name, kind: c.kind, target: c.target.toString(), rewardPoints: c.rewardPoints.toString(), badgeId: c.badgeId, enabled: c.enabled };
    });
  }

  async updateChallenge(ctx: TenantContext, id: string, dto: { name?: string; kind?: string; target?: number; rewardPoints?: number; badgeId?: string | null; enabled?: boolean }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.challenge.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('challenge not found');
      const c = await tx.challenge.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.target !== undefined ? { target: BigInt(dto.target) } : {}),
          ...(dto.rewardPoints !== undefined ? { rewardPoints: BigInt(dto.rewardPoints) } : {}),
          ...(dto.badgeId !== undefined ? { badgeId: dto.badgeId } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'challenge.update', targetType: 'challenge', targetId: id, data: { fields: Object.keys(dto) } });
      return { id: c.id, name: c.name, target: c.target.toString(), enabled: c.enabled };
    });
  }

  /** Deleting a challenge cascades its progress (onDelete: Cascade). */
  async deleteChallenge(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.challenge.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundException('challenge not found');
      await tx.challenge.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'challenge.delete', targetType: 'challenge', targetId: id, data: { name: existing.name } });
      return { id, deleted: true };
    });
  }
}
