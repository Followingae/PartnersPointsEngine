import { Injectable } from '@nestjs/common';
import type { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

interface RfmRow {
  membership_id: string;
  recency_days: number | null;
  frequency: number;
  monetary: bigint;
  r_score: number;
  f_score: number;
  m_score: number;
}

/** RFM segment from R/F/M quintile scores (classic loyalty segmentation). */
export function rfmSegment(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return 'champions';
  if (f >= 4 && m >= 3) return 'loyal';
  if (r >= 4 && f <= 2) return 'new';
  if (r >= 3 && (f >= 3 || m >= 3)) return 'potential_loyalist';
  if (r <= 2 && f >= 3) return 'at_risk';
  if (r <= 2 && f <= 2 && m >= 3) return 'cant_lose';
  if (r <= 2) return 'hibernating';
  return 'regular';
}

@Injectable()
export class ReportingService {
  constructor(private readonly tenants: TenantService) {}

  /** Brand KPI summary computed live from the ledger (read model rebuilds from this). */
  async brandSummary(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        { earned: bigint; redeemed: bigint; liability: bigint; members: number }[]
      >`
        SELECT coalesce(sum(ab.posted_credits), 0)::bigint AS earned,
               coalesce(sum(ab.posted_debits), 0)::bigint AS redeemed,
               coalesce(sum(ab.posted_credits - ab.posted_debits - ab.pending_debits), 0)::bigint AS liability,
               count(*)::int AS members
          FROM account_balance ab
          JOIN ledger_account la ON la.id = ab.account_id
         WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'`;
      const r = rows[0]!;
      return {
        pointsEarned: r.earned.toString(),
        pointsRedeemed: r.redeemed.toString(),
        pointsLiability: r.liability.toString(),
        members: r.members,
      };
    });
  }

  /** Per-member RFM with quintile scores + segment (the platform's namesake). */
  async rfm(ctx: TenantContext, limit = 500) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<RfmRow[]>`
        WITH base AS (
          SELECT la.customer_id AS membership_id,
                 EXTRACT(DAY FROM (now() - max(j.occurred_at)))::int AS recency_days,
                 count(DISTINCT j.id) FILTER (WHERE j.kind = 'earn')::int AS frequency,
                 ab.posted_credits AS monetary
            FROM ledger_account la
            JOIN account_balance ab ON ab.account_id = la.id
            LEFT JOIN entry e ON e.account_id = la.id AND e.direction = 'credit'
            LEFT JOIN journal j ON j.id = e.journal_id
           WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
           GROUP BY la.customer_id, ab.posted_credits
        ), scored AS (
          SELECT membership_id, recency_days, frequency, monetary,
                 ntile(5) OVER (ORDER BY recency_days DESC NULLS FIRST)::int AS r_score,
                 ntile(5) OVER (ORDER BY frequency ASC)::int AS f_score,
                 ntile(5) OVER (ORDER BY monetary ASC)::int AS m_score
            FROM base
        )
        SELECT * FROM scored ORDER BY m_score DESC, f_score DESC LIMIT ${limit}`;
      return rows.map((r) => ({
        membershipId: r.membership_id,
        recencyDays: r.recency_days,
        frequency: r.frequency,
        monetary: r.monetary.toString(),
        r: r.r_score,
        f: r.f_score,
        m: r.m_score,
        segment: rfmSegment(r.r_score, r.f_score, r.m_score),
      }));
    });
  }

  /** Persist an RFM snapshot for point-in-time reporting. */
  async snapshotRfm(ctx: TenantContext) {
    const segments = await this.rfm(ctx, 10_000);
    const asOf = new Date();
    asOf.setUTCHours(0, 0, 0, 0);
    return this.tenants.run(ctx, async (tx) => {
      for (const s of segments) {
        await tx.rfmSnapshot.upsert({
          where: { brandId_membershipId_asOf: { brandId: ctx.brandId!, membershipId: s.membershipId, asOf } },
          update: { recencyDays: s.recencyDays ?? 0, frequency: s.frequency, monetary: BigInt(s.monetary), rScore: s.r, fScore: s.f, mScore: s.m, segment: s.segment },
          create: {
            brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, membershipId: s.membershipId, asOf,
            recencyDays: s.recencyDays ?? 0, frequency: s.frequency, monetary: BigInt(s.monetary), rScore: s.r, fScore: s.f, mScore: s.m, segment: s.segment,
          },
        });
      }
      return { snapshot: segments.length, asOf };
    });
  }

  /** Roll up a day's brand metrics into brand_daily_metric (idempotent upsert). */
  async runDailyRollup(ctx: TenantContext, date = new Date()) {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ earned: bigint; redeemed: bigint; expired: bigint; txns: number; actives: number }[]>`
        SELECT
          coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'earn'), 0)::bigint AS earned,
          coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'redeem_capture'), 0)::bigint AS redeemed,
          coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'expiry'), 0)::bigint AS expired,
          count(DISTINCT j.id)::int AS txns,
          count(DISTINCT la.customer_id)::int AS actives
        FROM journal j
        JOIN entry e ON e.journal_id = j.id
        JOIN ledger_account la ON la.id = e.account_id AND la.account_type = 'points_liability'
        WHERE j.brand_id = ${ctx.brandId} AND j.occurred_at >= ${day} AND j.occurred_at < ${new Date(day.getTime() + 86_400_000)}`;
      const r = rows[0]!;
      await tx.brandDailyMetric.upsert({
        where: { brandId_date: { brandId: ctx.brandId!, date: day } },
        update: { pointsEarned: r.earned, pointsRedeemed: r.redeemed, pointsExpired: r.expired, txnCount: r.txns, activeCustomers: r.actives },
        create: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, date: day, pointsEarned: r.earned, pointsRedeemed: r.redeemed, pointsExpired: r.expired, txnCount: r.txns, activeCustomers: r.actives },
      });
      return { date: day, ...r, earned: r.earned.toString(), redeemed: r.redeemed.toString(), expired: r.expired.toString() };
    });
  }

  /** Platform-wide rollup for the superadmin (points liability + wallet balances). */
  async superadminOverview(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        { points_liability: bigint; wallet_balance: bigint; brands: number; groups: number; journals: number }[]
      >`
        SELECT
          (SELECT coalesce(sum(ab.posted_credits - ab.posted_debits - ab.pending_debits), 0)::bigint
             FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id
            WHERE la.platform_id = ${ctx.platformId} AND la.ledger = 'points' AND la.account_type = 'points_liability') AS points_liability,
          (SELECT coalesce(sum(ab.posted_credits - ab.posted_debits - ab.pending_debits), 0)::bigint
             FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id
            WHERE la.platform_id = ${ctx.platformId} AND la.ledger = 'wallet' AND la.account_type = 'wallet_liability') AS wallet_balance,
          (SELECT count(*)::int FROM brand WHERE platform_id = ${ctx.platformId}) AS brands,
          (SELECT count(*)::int FROM tenant_group WHERE platform_id = ${ctx.platformId}) AS groups,
          (SELECT count(*)::int FROM journal WHERE platform_id = ${ctx.platformId}) AS journals`;
      const r = rows[0]!;
      return {
        pointsLiabilityOutstanding: r.points_liability.toString(),
        walletBalancesTotal: r.wallet_balance.toString(),
        brands: r.brands,
        groups: r.groups,
        journals: r.journals,
      };
    });
  }

  /** Daily points earned/redeemed for the last N days (dashboard trend chart). */
  async pointsTrend(ctx: TenantContext, days = 14) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ d: string; earned: bigint; redeemed: bigint }[]>`
        SELECT to_char(date_trunc('day', j.occurred_at), 'YYYY-MM-DD') AS d,
               coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'earn'), 0)::bigint AS earned,
               coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'redeem_capture'), 0)::bigint AS redeemed
          FROM journal j
          JOIN entry e ON e.journal_id = j.id
          JOIN ledger_account la ON la.id = e.account_id AND la.account_type = 'points_liability'
         WHERE j.brand_id = ${ctx.brandId} AND j.occurred_at >= (current_date - ${days}::int)
         GROUP BY 1 ORDER BY 1`;
      return rows.map((r) => ({ date: r.d, earned: r.earned.toString(), redeemed: r.redeemed.toString() }));
    });
  }

  /** Points earned/redeemed split by loyalty TYPE (online vs in-store) over the last N days. */
  async pointsByType(ctx: TenantContext, days = 14) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ channel: string | null; earned: bigint; redeemed: bigint }[]>`
        SELECT j.channel AS channel,
               coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'earn'), 0)::bigint AS earned,
               coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'redeem_capture'), 0)::bigint AS redeemed
          FROM journal j
          JOIN entry e ON e.journal_id = j.id
          JOIN ledger_account la ON la.id = e.account_id AND la.account_type = 'points_liability'
         WHERE j.brand_id = ${ctx.brandId} AND j.occurred_at >= (current_date - ${days}::int)
         GROUP BY j.channel`;
      const find = (c: string) => rows.find((r) => r.channel === c);
      const pack = (c: 'online' | 'in_store') => {
        const r = find(c);
        return { channel: c, earned: (r?.earned ?? 0n).toString(), redeemed: (r?.redeemed ?? 0n).toString() };
      };
      return { days, types: [pack('online'), pack('in_store')] };
    });
  }

  /** RFM as CSV for export. */
  async rfmCsv(ctx: TenantContext): Promise<string> {
    const rows = await this.rfm(ctx, 10_000);
    const header = 'membershipId,recencyDays,frequency,monetary,r,f,m,segment';
    const body = rows
      .map((r) => [r.membershipId, r.recencyDays ?? '', r.frequency, r.monetary, r.r, r.f, r.m, r.segment].join(','))
      .join('\n');
    return `${header}\n${body}\n`;
  }
}
