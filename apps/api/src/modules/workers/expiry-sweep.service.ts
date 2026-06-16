import { Injectable } from '@nestjs/common';
import { ledger } from '@rfm-loyalty/db';
import { pointsAsset, type TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

/**
 * Point expiry / breakage sweep (Phase 6). FIFO without a separate lot table:
 * redemptions are assumed to consume the oldest earns first, so the points that
 * expire = (earned in already-expired buckets) − (total already debited), capped
 * at the current available balance. Posts a breakage journal (DEBIT liability /
 * CREDIT breakage_income), which is itself a debit — making re-runs idempotent.
 */
@Injectable()
export class ExpirySweepService {
  constructor(private readonly tenants: TenantService) {}

  async sweepBrand(ctx: TenantContext): Promise<{ accountsExpired: number; pointsExpired: string }> {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; earned_expired: bigint; posted_credits: bigint; posted_debits: bigint; pending_debits: bigint }[]
      >`
        SELECT la.id,
               coalesce(sum(e.amount_minor) FILTER (
                 WHERE e.direction = 'credit' AND e.expiry_bucket IS NOT NULL AND e.expiry_bucket < current_date
               ), 0)::bigint AS earned_expired,
               ab.posted_credits, ab.posted_debits, ab.pending_debits
          FROM ledger_account la
          JOIN account_balance ab ON ab.account_id = la.id
          LEFT JOIN entry e ON e.account_id = la.id
         WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
         GROUP BY la.id, ab.posted_credits, ab.posted_debits, ab.pending_debits`;

      const asset = pointsAsset(ctx.brandId!);
      let total = 0n;
      let accounts = 0;
      for (const r of rows) {
        const available = BigInt(r.posted_credits) - BigInt(r.posted_debits) - BigInt(r.pending_debits);
        let toExpire = BigInt(r.earned_expired) - BigInt(r.posted_debits);
        if (toExpire > available) toExpire = available;
        if (toExpire <= 0n) continue;

        const breakage = await ledger.getOrCreateAccount(tx, {
          ledger: 'points', accountType: 'breakage_income', normalSide: 'credit', assetCode: asset,
          platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: null,
        });
        await ledger.postJournal(tx, {
          ledger: 'points', kind: 'expiry', occurredAt: new Date(),
          scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, branchId: null },
          legs: [
            { accountId: r.id, normalSide: 'credit', direction: 'debit', amountMinor: toExpire, assetCode: asset, pointState: 'expired' },
            { accountId: breakage.id, normalSide: 'credit', direction: 'credit', amountMinor: toExpire, assetCode: asset },
          ],
        });
        total += toExpire;
        accounts += 1;
      }
      return { accountsExpired: accounts, pointsExpired: total.toString() };
    });
  }
}
