import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

/**
 * Brand analytics computed live off the immutable ledger (reproducible; a nightly
 * rollup/read-model is a later perf optimization). Covers the metrics leaders
 * ship: CLV, visit frequency / most-frequent-visitor, cohort retention, churn
 * risk, repeat rate, onboarding funnel, points-liability aging, and per-branch.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly tenants: TenantService) {}

  /** Customer Lifetime Value — over ALL enrolled members (never-active = 0). */
  async clv(ctx: TenantContext, topN = 20) {
    return this.tenants.run(ctx, async (tx) => {
      const summary = await tx.$queryRaw<{ members: number; total: bigint; avg: number; median: number; p90: number }[]>`
        WITH bal AS (
          SELECT coalesce(ab.posted_credits, 0) AS lifetime
            FROM customer_membership m
            LEFT JOIN ledger_account la ON la.customer_id = m.id AND la.brand_id = m.brand_id AND la.account_type = 'points_liability'
            LEFT JOIN account_balance ab ON ab.account_id = la.id
           WHERE m.brand_id = ${ctx.brandId})
        SELECT count(*)::int AS members,
               coalesce(sum(lifetime), 0)::bigint AS total,
               coalesce(avg(lifetime), 0)::float8 AS avg,
               coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY lifetime), 0)::float8 AS median,
               coalesce(percentile_cont(0.9) WITHIN GROUP (ORDER BY lifetime), 0)::float8 AS p90
          FROM bal`;
      const dist = await tx.$queryRaw<{ bucket: string; members: number }[]>`
        WITH bal AS (
          SELECT coalesce(ab.posted_credits, 0) AS lifetime
            FROM customer_membership m
            LEFT JOIN ledger_account la ON la.customer_id = m.id AND la.brand_id = m.brand_id AND la.account_type = 'points_liability'
            LEFT JOIN account_balance ab ON ab.account_id = la.id
           WHERE m.brand_id = ${ctx.brandId})
        SELECT CASE WHEN lifetime < 100 THEN '0-99'
                    WHEN lifetime < 500 THEN '100-499'
                    WHEN lifetime < 1000 THEN '500-999'
                    WHEN lifetime < 5000 THEN '1k-5k'
                    ELSE '5k+' END AS bucket,
               count(*)::int AS members
          FROM bal GROUP BY 1`;
      const top = await tx.$queryRaw<{ membership_id: string; loyalty_id: string; lifetime: bigint; redeemed: bigint }[]>`
        SELECT m.id AS membership_id, m.loyalty_id,
               coalesce(ab.posted_credits, 0)::bigint AS lifetime, coalesce(ab.posted_debits, 0)::bigint AS redeemed
          FROM customer_membership m
          LEFT JOIN ledger_account la ON la.customer_id = m.id AND la.brand_id = m.brand_id AND la.account_type = 'points_liability'
          LEFT JOIN account_balance ab ON ab.account_id = la.id
         WHERE m.brand_id = ${ctx.brandId}
         ORDER BY lifetime DESC LIMIT ${topN}`;
      const s = summary[0]!;
      const order = ['0-99', '100-499', '500-999', '1k-5k', '5k+'];
      return {
        summary: { members: s.members, totalLifetime: s.total.toString(), avgLifetime: Math.round(s.avg), medianLifetime: Math.round(s.median), p90Lifetime: Math.round(s.p90) },
        distribution: order.map((b) => ({ bucket: b, members: dist.find((d) => d.bucket === b)?.members ?? 0 })),
        top: top.map((t) => ({ membershipId: t.membership_id, loyaltyId: t.loyalty_id, lifetime: t.lifetime.toString(), redeemed: t.redeemed.toString(), net: (t.lifetime - t.redeemed).toString() })),
      };
    });
  }

  /** Visit frequency histogram + most-frequent-visitor leaderboard (by earn count). */
  async visitFrequency(ctx: TenantContext, topN = 20) {
    return this.tenants.run(ctx, async (tx) => {
      const histogram = await tx.$queryRaw<{ bucket: string; members: number }[]>`
        WITH f AS (
          SELECT la.customer_id, count(DISTINCT j.id) AS visits
            FROM ledger_account la
            JOIN entry e ON e.account_id = la.id AND e.direction = 'credit'
            JOIN journal j ON j.id = e.journal_id AND j.kind = 'earn'
           WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
           GROUP BY 1)
        SELECT CASE WHEN visits = 1 THEN '1' WHEN visits <= 5 THEN '2-5' WHEN visits <= 20 THEN '6-20' ELSE '20+' END AS bucket,
               count(*)::int AS members FROM f GROUP BY 1`;
      const leaderboard = await tx.$queryRaw<{ membership_id: string; loyalty_id: string; visits: number; last_visit: Date }[]>`
        SELECT la.customer_id AS membership_id, m.loyalty_id, count(DISTINCT j.id)::int AS visits, max(j.occurred_at) AS last_visit
          FROM ledger_account la
          JOIN customer_membership m ON m.id = la.customer_id
          JOIN entry e ON e.account_id = la.id AND e.direction = 'credit'
          JOIN journal j ON j.id = e.journal_id AND j.kind = 'earn'
         WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
         GROUP BY 1, 2 ORDER BY visits DESC, last_visit DESC LIMIT ${topN}`;
      const order = ['1', '2-5', '6-20', '20+'];
      return {
        histogram: order.map((b) => ({ bucket: b, members: histogram.find((h) => h.bucket === b)?.members ?? 0 })),
        leaderboard: leaderboard.map((r) => ({ membershipId: r.membership_id, loyaltyId: r.loyalty_id, visits: r.visits, lastVisit: r.last_visit })),
      };
    });
  }

  /** Cohort retention matrix: signup-month cohorts × months-since active %. */
  async cohortRetention(ctx: TenantContext, cohorts = 6, offsets = 6) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ cohort: Date; size: number; offset: number; retained: number }[]>`
        WITH members AS (
          SELECT m.id, date_trunc('month', m.joined_at)::date AS cohort
            FROM customer_membership m WHERE m.brand_id = ${ctx.brandId}
        ), activity AS (
          SELECT la.customer_id AS id, date_trunc('month', j.occurred_at)::date AS amonth
            FROM ledger_account la
            JOIN entry e ON e.account_id = la.id AND e.direction = 'credit'
            JOIN journal j ON j.id = e.journal_id AND j.kind = 'earn'
           WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
           GROUP BY 1, 2
        ), sizes AS (SELECT cohort, count(*)::int AS size FROM members GROUP BY cohort),
        ret AS (
          SELECT mb.cohort,
                 ((EXTRACT(YEAR FROM a.amonth) - EXTRACT(YEAR FROM mb.cohort)) * 12
                  + (EXTRACT(MONTH FROM a.amonth) - EXTRACT(MONTH FROM mb.cohort)))::int AS offset,
                 count(DISTINCT mb.id)::int AS retained
            FROM members mb JOIN activity a ON a.id = mb.id
           GROUP BY 1, 2
        )
        SELECT s.cohort, s.size, r.offset, r.retained
          FROM sizes s JOIN ret r ON r.cohort = s.cohort
         WHERE r.offset >= 0 AND r.offset < ${offsets}
         ORDER BY s.cohort DESC`;
      // pivot into rows of { cohort, size, retention: number[] (pct per offset) }
      const byCohort = new Map<string, { cohort: string; size: number; retention: (number | null)[] }>();
      for (const r of rows) {
        const key = r.cohort.toISOString().slice(0, 7);
        if (!byCohort.has(key)) byCohort.set(key, { cohort: key, size: r.size, retention: Array(offsets).fill(null) });
        const c = byCohort.get(key)!;
        c.retention[r.offset] = c.size ? Math.round((r.retained / c.size) * 100) : 0;
      }
      return { offsets, cohorts: [...byCohort.values()].slice(0, cohorts) };
    });
  }

  /** Churn risk by recency of last earn: active / cooling / at_risk / dormant. */
  async churnRisk(ctx: TenantContext, topN = 25) {
    return this.tenants.run(ctx, async (tx) => {
      const buckets = await tx.$queryRaw<{ bucket: string; members: number }[]>`
        WITH last AS (
          SELECT m.id AS id, max(j.occurred_at) AS last_at
            FROM customer_membership m
            LEFT JOIN ledger_account la ON la.customer_id = m.id AND la.brand_id = m.brand_id AND la.account_type = 'points_liability'
            LEFT JOIN entry e ON e.account_id = la.id AND e.direction = 'credit'
            LEFT JOIN journal j ON j.id = e.journal_id AND j.kind = 'earn'
           WHERE m.brand_id = ${ctx.brandId}
           GROUP BY m.id)
        SELECT CASE WHEN last_at IS NULL THEN 'dormant'
                    WHEN now() - last_at < interval '30 days' THEN 'active'
                    WHEN now() - last_at < interval '60 days' THEN 'cooling'
                    WHEN now() - last_at < interval '90 days' THEN 'at_risk'
                    ELSE 'dormant' END AS bucket,
               count(*)::int AS members
          FROM last GROUP BY 1`;
      const atRisk = await tx.$queryRaw<{ membership_id: string; loyalty_id: string; last_at: Date | null; days: number | null }[]>`
        WITH last AS (
          SELECT m.id AS id, max(j.occurred_at) AS last_at
            FROM customer_membership m
            LEFT JOIN ledger_account la ON la.customer_id = m.id AND la.brand_id = m.brand_id AND la.account_type = 'points_liability'
            LEFT JOIN entry e ON e.account_id = la.id AND e.direction = 'credit'
            LEFT JOIN journal j ON j.id = e.journal_id AND j.kind = 'earn'
           WHERE m.brand_id = ${ctx.brandId}
           GROUP BY m.id)
        SELECT l.id AS membership_id, m.loyalty_id, l.last_at,
               (EXTRACT(EPOCH FROM (now() - l.last_at)) / 86400)::int AS days
          FROM last l JOIN customer_membership m ON m.id = l.id
         WHERE l.last_at IS NOT NULL AND now() - l.last_at >= interval '60 days'
         ORDER BY l.last_at ASC LIMIT ${topN}`;
      const order = ['active', 'cooling', 'at_risk', 'dormant'];
      return {
        buckets: order.map((b) => ({ bucket: b, members: buckets.find((x) => x.bucket === b)?.members ?? 0 })),
        atRisk: atRisk.map((r) => ({ membershipId: r.membership_id, loyaltyId: r.loyalty_id, lastActivity: r.last_at, daysSince: r.days })),
      };
    });
  }

  /** Points scheduled to expire by month (liability aging). */
  async liabilityAging(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ bucket: string; points: bigint }[]>`
        SELECT to_char(e.expiry_bucket, 'YYYY-MM') AS bucket, coalesce(sum(e.amount_minor), 0)::bigint AS points
          FROM entry e JOIN ledger_account la ON la.id = e.account_id
         WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
           AND e.direction = 'credit' AND e.point_state = 'active' AND e.expiry_bucket IS NOT NULL
         GROUP BY 1 ORDER BY 1`;
      return rows.map((r) => ({ bucket: r.bucket, points: r.points.toString() }));
    });
  }

  /** Per-branch earn / redeem / active-member breakdown. */
  async byBranch(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ branch_id: string; name: string; earned: bigint; redeemed: bigint; members: number }[]>`
        SELECT b.id AS branch_id, b.name,
               coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'earn'), 0)::bigint AS earned,
               coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'redeem_capture'), 0)::bigint AS redeemed,
               count(DISTINCT la.customer_id)::int AS members
          FROM branch b
          LEFT JOIN journal j ON j.branch_id = b.id
          LEFT JOIN entry e ON e.journal_id = j.id
          LEFT JOIN ledger_account la ON la.id = e.account_id AND la.account_type = 'points_liability'
         WHERE b.brand_id = ${ctx.brandId}
         GROUP BY b.id, b.name ORDER BY earned DESC`;
      return rows.map((r) => ({ branchId: r.branch_id, name: r.name, earned: r.earned.toString(), redeemed: r.redeemed.toString(), members: r.members }));
    });
  }

  /** Repeat-purchase rate + onboarding funnel (joined → 1st earn → 2nd earn). */
  async engagement(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ joined: number; first_earn: number; second_earn: number }[]>`
        WITH members AS (SELECT m.id FROM customer_membership m WHERE m.brand_id = ${ctx.brandId}),
        f AS (
          SELECT la.customer_id AS id, count(DISTINCT j.id) AS visits
            FROM ledger_account la
            JOIN entry e ON e.account_id = la.id AND e.direction = 'credit'
            JOIN journal j ON j.id = e.journal_id AND j.kind = 'earn'
           WHERE la.brand_id = ${ctx.brandId} AND la.account_type = 'points_liability'
           GROUP BY 1)
        SELECT (SELECT count(*) FROM members)::int AS joined,
               count(*) FILTER (WHERE f.visits >= 1)::int AS first_earn,
               count(*) FILTER (WHERE f.visits >= 2)::int AS second_earn
          FROM members LEFT JOIN f ON f.id = members.id`;
      const r = rows[0]!;
      const repeatRate = r.first_earn ? Math.round((r.second_earn / r.first_earn) * 100) : 0;
      return {
        funnel: [
          { stage: 'Joined', count: r.joined },
          { stage: 'First earn', count: r.first_earn },
          { stage: 'Repeat earn', count: r.second_earn },
        ],
        repeatRate,
      };
    });
  }

  // ── CSV exports ──────────────────────────────────────────────────────────
  async clvCsv(ctx: TenantContext): Promise<string> {
    const { top } = await this.clv(ctx, 10_000);
    const header = 'membershipId,loyaltyId,lifetime,redeemed,net';
    const body = top.map((t) => [t.membershipId, t.loyaltyId, t.lifetime, t.redeemed, t.net].join(',')).join('\n');
    return `${header}\n${body}\n`;
  }

  async visitFrequencyCsv(ctx: TenantContext): Promise<string> {
    const { leaderboard } = await this.visitFrequency(ctx, 10_000);
    const header = 'membershipId,loyaltyId,visits,lastVisit';
    const body = leaderboard.map((r) => [r.membershipId, r.loyaltyId, r.visits, r.lastVisit ? new Date(r.lastVisit).toISOString() : ''].join(',')).join('\n');
    return `${header}\n${body}\n`;
  }

  async churnCsv(ctx: TenantContext): Promise<string> {
    const { atRisk } = await this.churnRisk(ctx, 10_000);
    const header = 'membershipId,loyaltyId,lastActivity,daysSince';
    const body = atRisk.map((r) => [r.membershipId, r.loyaltyId, r.lastActivity ? new Date(r.lastActivity).toISOString() : '', r.daysSince ?? ''].join(',')).join('\n');
    return `${header}\n${body}\n`;
  }
}
