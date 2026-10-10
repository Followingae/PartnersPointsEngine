import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ledger } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

const REFERRER_REWARD = 100n;
const REFEREE_REWARD = 50n;
/** A referee must join within this window to qualify as a genuine new member. */
const NEW_MEMBER_WINDOW_DAYS = 7;
/** Most rewarded referrals one referrer can earn in a rolling 30-day window. */
const REFERRER_MONTHLY_CAP = 20;

@Injectable()
export class ReferralService {
  constructor(private readonly tenants: TenantService) {}

  /** Get (or create) the caller's active referral code. */
  async getOrCreateCode(ctx: TenantContext, membershipId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.referral.findFirst({
        where: { brandId: ctx.brandId!, referrerMembershipId: membershipId, status: 'pending' },
      });
      if (existing) return { code: existing.code };
      const code = `REF${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
      const r = await tx.referral.create({
        data: {
          brandId: ctx.brandId!,
          groupId: ctx.groupId!,
          platformId: ctx.platformId,
          referrerMembershipId: membershipId,
          code,
          referrerRewardPoints: REFERRER_REWARD,
          refereeRewardPoints: REFEREE_REWARD,
        },
      });
      return { code: r.code };
    });
  }

  /** Redeem a referral code as a new member; rewards both parties. */
  async redeem(ctx: TenantContext, code: string, refereeMembershipId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const ref = await tx.referral.findUnique({ where: { code } });
      if (!ref || ref.brandId !== ctx.brandId) throw new NotFoundException('referral code not found');
      if (ref.status !== 'pending') throw new BadRequestException('referral code already used');
      if (ref.referrerMembershipId === refereeMembershipId) throw new BadRequestException('cannot refer yourself');

      // Anti-abuse. The engine credits real liability, so these are the only
      // thing between the program and unlimited minting (the referral
      // ping-pong the audit reproduced: two accounts referring each other in a
      // loop). All checks are scoped to the brand.

      // (1) One-time referee, for life: a membership can be rewarded as a
      // referee at most once on a brand.
      const alreadyReferee = await tx.referral.count({
        where: { brandId: ctx.brandId!, refereeMembershipId, status: 'rewarded' },
      });
      if (alreadyReferee > 0) throw new BadRequestException('this member has already used a referral code');

      // (2) No reciprocal pair: block if the referee previously referred this
      // referrer. This is what actually kills the A↔B loop.
      const reciprocal = await tx.referral.count({
        where: {
          brandId: ctx.brandId!,
          referrerMembershipId: refereeMembershipId,
          refereeMembershipId: ref.referrerMembershipId,
        },
      });
      if (reciprocal > 0) throw new BadRequestException('reciprocal referrals are not allowed');

      // (3) Genuine new member: the referee must have joined recently.
      const referee = await tx.customerMembership.findUnique({
        where: { id: refereeMembershipId },
        select: { joinedAt: true },
      });
      if (!referee) throw new NotFoundException('member not found');
      const ageMs = Date.now() - referee.joinedAt.getTime();
      if (ageMs > NEW_MEMBER_WINDOW_DAYS * 86_400_000) {
        throw new BadRequestException('referral codes can only be redeemed by new members');
      }

      // (4) Referrer rolling cap: limit rewarded referrals per 30 days.
      const since = new Date(Date.now() - 30 * 86_400_000);
      const recentRewards = await tx.referral.count({
        where: {
          brandId: ctx.brandId!,
          referrerMembershipId: ref.referrerMembershipId,
          status: 'rewarded',
          qualifiedAt: { gte: since },
        },
      });
      if (recentRewards >= REFERRER_MONTHLY_CAP) {
        throw new BadRequestException('referral reward limit reached for this period');
      }

      const occurredAt = new Date();
      await ledger.earnPoints(tx, {
        scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: ref.referrerMembershipId },
        points: ref.referrerRewardPoints,
        occurredAt,
        sourceEvent: `referral:${ref.id}`,
        idem: { actorId: ctx.actor.id, key: `ref-rer:${ref.id}` },
      });
      await ledger.earnPoints(tx, {
        scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: refereeMembershipId },
        points: ref.refereeRewardPoints,
        occurredAt,
        sourceEvent: `referral:${ref.id}`,
        idem: { actorId: ctx.actor.id, key: `ref-ree:${ref.id}` },
      });
      await tx.referral.update({
        where: { id: ref.id },
        data: { refereeMembershipId, status: 'rewarded', qualifiedAt: occurredAt },
      });
      return {
        status: 'rewarded',
        referrerReward: ref.referrerRewardPoints.toString(),
        refereeReward: ref.refereeRewardPoints.toString(),
      };
    });
  }
}
