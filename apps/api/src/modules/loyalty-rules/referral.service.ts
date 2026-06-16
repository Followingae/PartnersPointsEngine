import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ledger } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

const REFERRER_REWARD = 100n;
const REFEREE_REWARD = 50n;

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
