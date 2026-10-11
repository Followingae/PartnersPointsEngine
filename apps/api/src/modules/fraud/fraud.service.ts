import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { EmailService } from '../../platform-core/email/email.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { NotificationService } from '../notifications/notification.service';
import { FRAUD_RULES, FRAUD_RULE_KEYS, type FraudRuleDef } from './fraud.constants';

type Tx = Prisma.TransactionClient;

interface EffectiveRule extends FraudRuleDef {
  enabled: boolean;
  overridden: boolean;
}

interface Hit {
  subjectId: string;
  membershipId: string | null;
  terminalId: string | null;
  metric: bigint;
  detail: Record<string, unknown>;
}

/**
 * Fraud protection. Detects abusive earning/redeeming patterns a brand or the
 * platform would want to know about — a member earning many times a day, a
 * cashier farming their own number, referral bursts — and records a deduped
 * alert plus an email trigger. Brands configure thresholds for their own brand;
 * superadmins see and act on everything.
 */
@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(
    private readonly tenants: TenantService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Configuration ───────────────────────────────────────────────────────────

  /** The effective rule set for a brand: code defaults merged with overrides. */
  async effectiveRules(ctx: TenantContext): Promise<EffectiveRule[]> {
    const rows = await this.tenants.run(ctx, (tx) =>
      tx.fraudRule.findMany({ where: { brandId: ctx.brandId! } }),
    );
    const byKey = new Map(rows.map((r) => [r.ruleKey, r]));
    return FRAUD_RULE_KEYS.map((key) => {
      const def = FRAUD_RULES[key]!;
      const o = byKey.get(key);
      return {
        ...def,
        thresholdNum: o ? o.thresholdNum : def.thresholdNum,
        windowSeconds: o ? o.windowSeconds : def.windowSeconds,
        severity: (o?.severity as FraudRuleDef['severity']) ?? def.severity,
        action: (o?.action as FraudRuleDef['action']) ?? def.action,
        enabled: o ? o.enabled : true,
        overridden: Boolean(o),
      };
    });
  }

  /** Upsert a brand's override for one rule. */
  async setRule(
    ctx: TenantContext,
    ruleKey: string,
    patch: { enabled?: boolean; thresholdNum?: string; windowSeconds?: number; severity?: string; action?: string },
  ) {
    if (!FRAUD_RULES[ruleKey]) throw new NotFoundException('unknown fraud rule');
    const def = FRAUD_RULES[ruleKey]!;
    if (patch.severity && !['low', 'medium', 'high', 'critical'].includes(patch.severity)) {
      throw new BadRequestException('invalid severity');
    }
    if (patch.action && !['alert', 'flag', 'block'].includes(patch.action)) {
      throw new BadRequestException('invalid action');
    }
    const threshold = patch.thresholdNum != null ? BigInt(patch.thresholdNum) : def.thresholdNum;
    if (threshold < 1n) throw new BadRequestException('threshold must be >= 1');
    return this.tenants.run(ctx, async (tx) => {
      const row = await tx.fraudRule.upsert({
        where: { brandId_ruleKey: { brandId: ctx.brandId!, ruleKey } },
        create: {
          platformId: ctx.platformId,
          groupId: ctx.groupId!,
          brandId: ctx.brandId!,
          ruleKey,
          enabled: patch.enabled ?? true,
          thresholdNum: threshold,
          windowSeconds: patch.windowSeconds ?? def.windowSeconds,
          severity: patch.severity ?? def.severity,
          action: patch.action ?? def.action,
          updatedBy: ctx.actor.id,
        },
        update: {
          enabled: patch.enabled ?? undefined,
          thresholdNum: patch.thresholdNum != null ? threshold : undefined,
          windowSeconds: patch.windowSeconds ?? undefined,
          severity: patch.severity ?? undefined,
          action: patch.action ?? undefined,
          updatedBy: ctx.actor.id,
          updatedAt: new Date(),
        },
      });
      return this.serializeRule(row);
    });
  }

  // ── Alerts (read / act) ──────────────────────────────────────────────────────

  async listAlerts(ctx: TenantContext, opts: { status?: string; limit?: number }) {
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const rows = await this.tenants.run(ctx, (tx) =>
      tx.fraudAlert.findMany({
        where: opts.status ? { status: opts.status } : undefined,
        orderBy: { createdAt: 'desc' },
        take,
      }),
    );
    return rows.map((r) => this.serializeAlert(r));
  }

  async acknowledge(ctx: TenantContext, id: string) {
    return this.transition(ctx, id, { status: 'acknowledged', acknowledgedBy: ctx.actor.id, acknowledgedAt: new Date() });
  }

  async resolve(ctx: TenantContext, id: string, dismiss = false) {
    return this.transition(ctx, id, {
      status: dismiss ? 'dismissed' : 'resolved',
      resolvedBy: ctx.actor.id,
      resolvedAt: new Date(),
    });
  }

  private async transition(ctx: TenantContext, id: string, data: Prisma.FraudAlertUpdateInput) {
    return this.tenants.run(ctx, async (tx) => {
      const found = await tx.fraudAlert.findFirst({ where: { id } });
      if (!found) throw new NotFoundException('alert not found');
      const row = await tx.fraudAlert.update({ where: { id }, data });
      return this.serializeAlert(row);
    });
  }

  // ── Detection ─────────────────────────────────────────────────────────────────

  /**
   * Evaluate every enabled rule for one brand over the current day and raise a
   * deduped alert per offending subject. Runs under a brand-scoped context, so
   * RLS confines both the reads and the alert inserts to this brand.
   */
  async evaluateBrand(ctx: TenantContext): Promise<{ raised: number }> {
    const rules = await this.effectiveRules(ctx);
    const windowStart = startOfUtcDay();
    const windowEnd = new Date(windowStart.getTime() + 86_400_000);

    // Detect + persist inside one transaction; collect the newly-raised alerts.
    // Dispatch (email + notification centre) happens AFTER the transaction commits
    // — a notification insert runs under a different RLS scope, and an email is an
    // outbound HTTP call that should never hold a database transaction open.
    const fresh: Array<{ rule: EffectiveRule; hit: Hit; alertId: string }> = [];
    await this.tenants.run(ctx, async (tx) => {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const hits = await this.detect(tx, ctx.brandId!, rule, windowStart);
        for (const hit of hits) {
          const alertId = await this.raise(tx, ctx, rule, hit, windowStart, windowEnd);
          if (alertId) fresh.push({ rule, hit, alertId });
        }
      }
    });

    for (const { rule, hit, alertId } of fresh) {
      await this.dispatch(ctx, rule, hit, alertId);
    }
    return { raised: fresh.length };
  }

  private async detect(
    tx: Tx,
    brandId: string,
    rule: EffectiveRule,
    windowStart: Date,
  ): Promise<Hit[]> {
    const t = rule.thresholdNum;
    switch (rule.key) {
      case 'member_velocity_daily': {
        const rows = await tx.$queryRaw<{ subject_id: string; metric: bigint }[]>`
          SELECT membership_id AS subject_id, count(*)::bigint AS metric
            FROM terminal_transaction
           WHERE brand_id = ${brandId} AND intent = 'earn' AND state = 'captured'
             AND membership_id IS NOT NULL AND created_at >= ${windowStart}
           GROUP BY membership_id HAVING count(*) > ${t}`;
        return rows.map((r) => ({ subjectId: r.subject_id, membershipId: r.subject_id, terminalId: null, metric: BigInt(r.metric), detail: { earns: Number(r.metric) } }));
      }
      case 'member_points_daily': {
        const rows = await tx.$queryRaw<{ subject_id: string; metric: bigint }[]>`
          SELECT membership_id AS subject_id, coalesce(sum(points),0)::bigint AS metric
            FROM terminal_transaction
           WHERE brand_id = ${brandId} AND intent = 'earn' AND state = 'captured'
             AND membership_id IS NOT NULL AND created_at >= ${windowStart}
           GROUP BY membership_id HAVING coalesce(sum(points),0) > ${t}`;
        return rows.map((r) => ({ subjectId: r.subject_id, membershipId: r.subject_id, terminalId: null, metric: BigInt(r.metric), detail: { points: Number(r.metric) } }));
      }
      case 'terminal_self_earn': {
        const rows = await tx.$queryRaw<{ terminal_id: string; membership_id: string; metric: bigint }[]>`
          SELECT terminal_id, membership_id, count(*)::bigint AS metric
            FROM terminal_transaction
           WHERE brand_id = ${brandId} AND intent = 'earn' AND state = 'captured'
             AND terminal_id IS NOT NULL AND membership_id IS NOT NULL AND created_at >= ${windowStart}
           GROUP BY terminal_id, membership_id HAVING count(*) > ${t}`;
        return rows.map((r) => ({
          subjectId: `${r.terminal_id}:${r.membership_id}`,
          membershipId: r.membership_id,
          terminalId: r.terminal_id,
          metric: BigInt(r.metric),
          detail: { terminalId: r.terminal_id, membershipId: r.membership_id, earns: Number(r.metric) },
        }));
      }
      case 'referral_burst': {
        const rows = await tx.$queryRaw<{ subject_id: string; metric: bigint }[]>`
          SELECT referrer_membership_id AS subject_id, count(*)::bigint AS metric
            FROM referral
           WHERE brand_id = ${brandId} AND status = 'rewarded' AND qualified_at >= ${windowStart}
           GROUP BY referrer_membership_id HAVING count(*) > ${t}`;
        return rows.map((r) => ({ subjectId: r.subject_id, membershipId: r.subject_id, terminalId: null, metric: BigInt(r.metric), detail: { rewards: Number(r.metric) } }));
      }
      default:
        return [];
    }
  }

  /** Insert an alert, ignoring the duplicate for a window already alerted. Returns the new id, or null if it already existed. */
  private async raise(
    tx: Tx,
    ctx: TenantContext,
    rule: EffectiveRule,
    hit: Hit,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO fraud_alert
        (platform_id, group_id, brand_id, rule_key, severity, subject_type, subject_id,
         membership_id, terminal_id, window_start, window_end, metric_value, threshold_value, detail, status)
      VALUES
        (${ctx.platformId}, ${ctx.groupId!}, ${ctx.brandId!}, ${rule.key}, ${rule.severity}, ${rule.subjectType}, ${hit.subjectId},
         ${hit.membershipId}, ${hit.terminalId}, ${windowStart}, ${windowEnd}, ${hit.metric}, ${rule.thresholdNum},
         ${JSON.stringify(hit.detail)}::jsonb, 'open')
      ON CONFLICT (brand_id, rule_key, subject_id, window_start) DO NOTHING
      RETURNING id`;
    return rows[0]?.id ?? null;
  }

  /**
   * Surface a newly-raised alert. Runs after the detection transaction commits.
   * Three channels, none of which hold a DB transaction open: the operator
   * notification centre (brand feed + platform feed), and an email to the
   * configured fraud inbox. All three are best-effort — a failure to notify must
   * not lose the alert, which is already persisted.
   */
  private async dispatch(ctx: TenantContext, rule: EffectiveRule, hit: Hit, alertId: string): Promise<void> {
    const line = `${rule.title} — subject ${hit.subjectId}, observed ${hit.metric} (threshold ${rule.thresholdNum})`;
    const data = {
      brandId: ctx.brandId,
      ruleKey: rule.key,
      subject: hit.subjectId,
      metric: hit.metric.toString(),
      threshold: rule.thresholdNum.toString(),
      ...hit.detail,
    };

    // Notification centre — one row for the brand, one for the platform feed.
    try {
      await this.notifications.publish(ctx, {
        audience: 'brand',
        source: 'fraud',
        category: 'fraud_alert',
        severity: rule.severity,
        title: rule.title,
        body: `${rule.description} (${hit.metric} vs threshold ${rule.thresholdNum})`,
        link: '/fraud',
        data,
        dedupeKey: `fraud:${alertId}`,
        relatedId: alertId,
      });
      const platformCtx: TenantContext = {
        ...ctx,
        scopeLevel: 'platform',
        groupId: null,
        brandId: null,
        branchId: null,
      };
      await this.notifications.publish(platformCtx, {
        audience: 'platform',
        source: 'fraud',
        category: 'fraud_alert',
        severity: rule.severity,
        title: rule.title,
        body: `Brand ${ctx.brandId}: ${rule.description} (${hit.metric} vs threshold ${rule.thresholdNum})`,
        link: '/fraud',
        data,
        dedupeKey: `fraud:${alertId}`,
        relatedId: alertId,
      });
    } catch (e) {
      this.logger.error(`[fraud] notification publish failed for alert ${alertId}: ${(e as Error).message}`);
    }

    // Email — to the configured fraud inbox, across all severities.
    const to = this.config.get<string>('FRAUD_ALERT_EMAIL');
    if (!to) {
      this.logger.warn(`[fraud] ${rule.severity} ${rule.key} brand=${ctx.brandId} ${line} (no FRAUD_ALERT_EMAIL set)`);
      return;
    }
    try {
      await this.email.sendFraudAlert(to, {
        brandName: ctx.brandId ?? 'unknown',
        ruleKey: rule.key,
        severity: rule.severity,
        subject: hit.subjectId,
        metric: hit.metric.toString(),
        threshold: rule.thresholdNum.toString(),
        detail: rule.description,
      });
      this.logger.log(`[fraud] ${rule.severity} ${rule.key} brand=${ctx.brandId} ${line}`);
    } catch (e) {
      this.logger.error(`[fraud] email failed for alert ${alertId}: ${(e as Error).message}`);
    }
  }

  // ── serialization (bigint → string) ──────────────────────────────────────────

  private serializeRule(r: {
    id: string; ruleKey: string; enabled: boolean; thresholdNum: bigint; windowSeconds: number; severity: string; action: string;
  }) {
    return { id: r.id, ruleKey: r.ruleKey, enabled: r.enabled, thresholdNum: r.thresholdNum.toString(), windowSeconds: r.windowSeconds, severity: r.severity, action: r.action };
  }

  private serializeAlert(r: {
    id: string; ruleKey: string; severity: string; subjectType: string; subjectId: string; membershipId: string | null; terminalId: string | null;
    windowStart: Date; windowEnd: Date; metricValue: bigint; thresholdValue: bigint; detail: unknown; status: string; createdAt: Date;
    acknowledgedBy: string | null; acknowledgedAt: Date | null; resolvedBy: string | null; resolvedAt: Date | null;
  }) {
    return {
      id: r.id,
      ruleKey: r.ruleKey,
      severity: r.severity,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      membershipId: r.membershipId,
      terminalId: r.terminalId,
      windowStart: r.windowStart,
      windowEnd: r.windowEnd,
      metricValue: r.metricValue.toString(),
      thresholdValue: r.thresholdValue.toString(),
      detail: r.detail,
      status: r.status,
      acknowledgedBy: r.acknowledgedBy,
      acknowledgedAt: r.acknowledgedAt,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
    };
  }
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
