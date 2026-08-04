import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ledger, type Prisma } from '@rfm-loyalty/db';
import { type TenantContext } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { sortClause, type ListQuery, type ListResult } from './list';

export interface CompletedChallenge {
  id: string;
  name: string;
  kind: string;
  rewardPoints: string;
  /**
   * What the till prints after "UNLOCKED:".
   *
   * The deployed fleet reads this field and falls back to the challenge name,
   * so it carries the badge when there is one and otherwise the reward that was
   * actually won — "FREE COFFEE" says more on a slip than "COFFEE CARD".
   *
   * Never null. Android's `org.json` returns the *string* "null" from
   * `optString` for a JSON null, which is how tills started printing
   * "UNLOCKED: NULL". Omitted entirely when there is nothing to say, so the
   * client's `ifBlank` check does what it was written to do.
   */
  badgeName?: string;
  /** The reward's own name, for clients that don't have to guess. */
  rewardName?: string;
  voucherCode?: string;
}

/** A stamp card's live state for the till and the customer app. */
export interface StampProgress {
  id: string;
  name: string;
  progress: number;
  target: number;
  completions: number;
  /** Filled on this very visit — the till celebrates instead of showing a fresh card. */
  justCompleted?: boolean;
}

export interface GamificationOutcome {
  completedChallengeIds: string[];
  completed: CompletedChallenge[];
  stamps: StampProgress[];
}

/**
 * Gamification: challenges (lifetime points / visits / spend) that award badges,
 * bonus points and reward vouchers. Repeatable visit challenges are stamp cards
 * — they roll over each time they fill. Bonus earns are tagged so they don't
 * recursively re-trigger evaluation. Plus a brand leaderboard.
 */
@Injectable()
export class GamificationService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Evaluate every challenge kind after an earn (within the earn tx):
   *   lifetime_points — absolute lifetime balance
   *   visits          — +1 per earning visit  (stamp cards live here)
   *   spend           — + the amount spent
   *
   * A repeatable challenge is a stamp card: when it fills it awards its reward
   * (points / badge / a voucher for a catalogue item) and rolls over, carrying
   * any surplus into the next card.
   */
  async onEarnWithTx(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    membershipId: string,
    lifetime: bigint,
    event: { isVisit?: boolean; amountMinor?: number } = {},
  ): Promise<GamificationOutcome> {
    const now = new Date();
    const challenges = await tx.challenge.findMany({
      where: {
        brandId: ctx.brandId!,
        enabled: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
    });

    const completed: CompletedChallenge[] = [];
    const stamps: StampProgress[] = [];

    for (const ch of challenges) {
      const existing = await tx.challengeProgress.findUnique({
        where: { challengeId_membershipId: { challengeId: ch.id, membershipId } },
      });

      // how far along is the member after this event?
      const increment =
        ch.kind === 'visits' ? (event.isVisit === false ? 0n : 1n)
          : ch.kind === 'spend' ? BigInt(event.amountMinor ?? 0)
            : 0n;
      let progress = ch.kind === 'lifetime_points' ? lifetime : (existing?.progress ?? 0n) + increment;
      let completions = existing?.completions ?? 0;
      let completedAt = existing?.completedAt ?? null;

      const alreadyDone = completedAt !== null && !ch.repeatable;
      if (!alreadyDone && ch.target > 0n && progress >= ch.target) {
        // award — possibly several times if a big spend fills more than one card
        const fills = ch.repeatable ? Number(progress / ch.target) : 1;
        for (let i = 0; i < fills; i++) {
          const suffix = ch.repeatable ? `:${completions + i + 1}` : '';
          if (ch.rewardPoints > 0n) {
            await this.bonus(tx, ctx, membershipId, ch.rewardPoints, `challenge:${ch.id}${suffix}`);
          }
          if (ch.badgeId) await this.awardBadge(tx, ctx, membershipId, ch.badgeId);
          const voucherCode = ch.rewardItemId
            ? await this.issueVoucher(tx, ctx, membershipId, ch.rewardItemId)
            : null;
          const badgeName = ch.badgeId
            ? (await tx.badge.findUnique({ where: { id: ch.badgeId }, select: { name: true } }))?.name ?? null
            : null;
          const rewardName = ch.rewardItemId
            ? (await tx.rewardCatalogItem.findUnique({
                where: { id: ch.rewardItemId },
                select: { name: true },
              }))?.name ?? null
            : null;
          // Keys are omitted rather than set to null — see `badgeName` above.
          completed.push({
            id: ch.id,
            name: ch.name,
            kind: ch.kind,
            rewardPoints: ch.rewardPoints.toString(),
            ...(badgeName ?? rewardName
              ? {
                  // The paper slip prints this after 'UNLOCKED:'. The code goes on
                  // the same line because a reward the customer cannot claim at
                  // the counter is not much of a reward.
                  badgeName: [badgeName ?? rewardName, voucherCode ? `CODE ${voucherCode}` : null]
                    .filter(Boolean)
                    .join(' · '),
                }
              : {}),
            ...(rewardName ? { rewardName } : {}),
            ...(voucherCode ? { voucherCode } : {}),
          });
        }
        completions += fills;
        if (ch.repeatable) {
          progress -= ch.target * BigInt(fills); // carry the surplus into the next card
          completedAt = null;
        } else {
          completedAt = now;
        }
      }

      if (increment > 0n || existing == null || ch.kind === 'lifetime_points') {
        await tx.challengeProgress.upsert({
          where: { challengeId_membershipId: { challengeId: ch.id, membershipId } },
          update: { progress, completedAt, completions },
          create: {
            brandId: ctx.brandId!,
            groupId: ctx.groupId!,
            platformId: ctx.platformId,
            challengeId: ch.id,
            membershipId,
            progress,
            completedAt,
            completions,
          },
        });
      }

      // Stamp cards are what the till prints — surface their live state.
      //
      // On the visit that fills a card, `progress` has already rolled over to
      // the carry-over for the next one, so sending it would print "0 OF 10 ·
      // 10 TO GO" at the exact moment the customer earned their reward. The
      // card the customer just finished is the one that gets printed; the fresh
      // one starts on their next receipt.
      if (ch.repeatable && ch.kind === 'visits') {
        const filledNow = completed.some((c) => c.id === ch.id);
        stamps.push({
          id: ch.id,
          name: ch.name,
          progress: filledNow ? Number(ch.target) : Number(progress),
          target: Number(ch.target),
          completions,
          ...(filledNow ? { justCompleted: true } : {}),
        });
      }
    }

    return { completedChallengeIds: completed.map((c) => c.id), completed, stamps };
  }

  /** Issue a reward voucher with no points cost (a challenge/stamp payout). */
  private async issueVoucher(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    membershipId: string,
    catalogItemId: string,
  ): Promise<string | null> {
    const item = await tx.rewardCatalogItem.findFirst({
      where: { id: catalogItemId, brandId: ctx.brandId!, status: 'active' },
      select: { id: true },
    });
    if (!item) return null;
    const code = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    await tx.voucher.create({
      data: {
        brandId: ctx.brandId!,
        groupId: ctx.groupId!,
        platformId: ctx.platformId,
        catalogItemId: item.id,
        membershipId,
        code,
        pointsSpent: 0n, // earned, not bought
      },
    });
    return code;
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

  /**
   * The member's challenges and stamp cards, with where they've got to.
   *
   * Stamp cards are the repeatable ones: they issue a reward each time they
   * fill and start over, so `progress` is progress around the current card and
   * `completions` is how many have been filled before it.
   */
  async memberChallenges(ctx: TenantContext, membershipId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const now = new Date();
      const challenges = await tx.challenge.findMany({
        where: {
          brandId: ctx.brandId!,
          enabled: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (challenges.length === 0) return [];

      const progress = await tx.challengeProgress.findMany({
        where: { membershipId, challengeId: { in: challenges.map((c) => c.id) } },
      });
      const byChallenge = new Map(progress.map((p) => [p.challengeId, p]));

      const rewardIds = challenges.map((c) => c.rewardItemId).filter((v): v is string => Boolean(v));
      const rewards = rewardIds.length
        ? await tx.rewardCatalogItem.findMany({
            where: { id: { in: rewardIds } },
            select: { id: true, name: true },
          })
        : [];
      const rewardById = new Map(rewards.map((r) => [r.id, r.name]));

      return challenges.map((c) => {
        const p = byChallenge.get(c.id);
        const done = p?.progress ?? 0n;
        const target = c.target > 0n ? c.target : 1n;
        return {
          id: c.id,
          name: c.name,
          kind: c.kind,
          /** A repeatable visits challenge is what the app draws as a stamp card. */
          isStampCard: c.repeatable && c.kind === 'visits',
          target: target.toString(),
          progress: done.toString(),
          progressPct: Math.min(100, Number((done * 100n) / target)),
          completions: p?.completions ?? 0,
          completedAt: p?.completedAt ?? null,
          rewardPoints: c.rewardPoints.toString(),
          rewardName: c.rewardItemId ? (rewardById.get(c.rewardItemId) ?? null) : null,
          endsAt: c.endsAt,
        };
      });
    });
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

  async createChallenge(ctx: TenantContext, dto: { name: string; kind?: string; target: number; rewardPoints?: number; badgeId?: string; repeatable?: boolean; rewardItemId?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const c = await tx.challenge.create({
        data: {
          brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId,
          name: dto.name, kind: dto.kind ?? 'lifetime_points', target: BigInt(dto.target),
          rewardPoints: BigInt(dto.rewardPoints ?? 0), badgeId: dto.badgeId ?? null,
          repeatable: dto.repeatable ?? false, rewardItemId: dto.rewardItemId ?? null,
        },
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
      return { rows: items.map((c) => ({ id: c.id, name: c.name, kind: c.kind, target: c.target.toString(), rewardPoints: c.rewardPoints.toString(), badgeId: c.badgeId, enabled: c.enabled, repeatable: c.repeatable, rewardItemId: c.rewardItemId })), total } satisfies ListResult<unknown>;
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

  async updateChallenge(ctx: TenantContext, id: string, dto: { name?: string; kind?: string; target?: number; rewardPoints?: number; badgeId?: string | null; enabled?: boolean; repeatable?: boolean; rewardItemId?: string | null }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.challenge.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('challenge not found');
      const c = await tx.challenge.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.repeatable !== undefined ? { repeatable: dto.repeatable } : {}),
          ...(dto.rewardItemId !== undefined ? { rewardItemId: dto.rewardItemId } : {}),
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
