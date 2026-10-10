import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@rfm-loyalty/shared';
import { PrismaService } from '../../platform-core/prisma/prisma.service';
import { ExpirySweepService } from './expiry-sweep.service';
import { AccountDeletionService } from '../customer-wallet/deletion.service';
import { SettlementService } from './settlement.service';
import { TxnAlertService } from './txn-alert.service';
import { WebhookService } from './webhook.service';
import { FraudService } from '../fraud/fraud.service';

/**
 * Runs the background jobs.
 *
 * There was previously nothing to run them. `WorkerScheduler` queued repeatable
 * BullMQ jobs, but no processor was ever registered to consume them, REDIS_URL
 * isn't configured, and the deployed 'jobs' worker runs the same API entrypoint
 * with a ROLE env var no code reads. The consequence was quiet and real:
 * webhooks were never delivered, group-wallet settlement never ran, and points
 * that should have expired never did.
 *
 * These are plain intervals against Postgres rather than a queue. At this volume
 * that is genuinely the right tool — and every job either claims its rows
 * (SKIP LOCKED) or is idempotent, so running on all API instances is safe rather
 * than merely tolerated. Redis can come back later for scale without changing
 * any of the services.
 */
@Injectable()
export class WorkerRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRunner.name);
  private readonly timers: NodeJS.Timeout[] = [];
  /** Per-job guard so a slow pass never overlaps its own next tick. */
  private readonly busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: TxnAlertService,
    private readonly webhooks: WebhookService,
    private readonly settlement: SettlementService,
    private readonly expiry: ExpirySweepService,
    private readonly deletions: AccountDeletionService,
    private readonly fraud: FraudService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env.SKIP_DB === '1' || process.env.NODE_ENV === 'test') return;
    if (this.config.get<string>('WORKERS_ENABLED') === 'false') {
      this.logger.log('background jobs disabled by WORKERS_ENABLED=false');
      return;
    }

    // A customer alert is stale within minutes; the rest can breathe.
    this.every('txn-alerts', 15, () => this.alerts.relay().then(() => undefined));
    this.every('webhooks', 30, () => this.perBrand('webhooks', async (ctx) => {
      await this.webhooks.relayOutbox(ctx);
      await this.webhooks.deliverPending(ctx);
    }));
    this.every('settlement', 60, () => this.perGroup('settlement', (ctx) =>
      this.settlement.settleGroup(ctx).then(() => undefined)));
    // Expiry is a daily concern, but an hourly pass is cheap and means a missed
    // window costs an hour rather than a day.
    this.every('point-expiry', 3600, () => this.perBrand('point-expiry', (ctx) =>
      this.expiry.sweepBrand(ctx).then(() => undefined)));

    // Hourly is right for a thirty-day deadline: nobody notices sixty minutes,
    // and it means a restart cannot leave a due deletion sitting for a day.
    this.every('account-deletions', 3600, () => this.deletions.sweep().then(() => undefined));

    // Fraud scan every 10 minutes: raise deduped alerts for abusive earning
    // patterns (member velocity, cashier self-earn, referral bursts).
    this.every('fraud-scan', 600, () => this.perBrand('fraud-scan', (ctx) =>
      this.fraud.evaluateBrand(ctx).then(() => undefined)));

    // Data-retention purge once a day (expired tokens, old outbox / webhook /
    // idempotency / OTP rows). A SECURITY DEFINER function so it works under the
    // non-owner runtime role.
    this.every('retention', 86_400, () => this.runRetention());

    this.logger.log(
      'background jobs running: txn-alerts, webhooks, settlement, point-expiry, account-deletions, fraud-scan, retention',
    );
  }

  private async runRetention(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT * FROM public.run_retention()`;
    } catch (e) {
      this.logger.error(`retention purge failed: ${(e as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearInterval(t);
  }

  private every(name: string, seconds: number, run: () => Promise<void>): void {
    const timer = setInterval(() => {
      if (this.busy.has(name)) return;
      this.busy.add(name);
      run()
        // A failed pass must never kill the interval — the next tick retries.
        .catch((e) => this.logger.error(`${name} failed: ${(e as Error).message}`))
        .finally(() => this.busy.delete(name));
    }, seconds * 1000);
    timer.unref?.();
    this.timers.push(timer);
  }

  /** Every active brand, as a system principal. */
  private async perBrand(job: string, run: (ctx: TenantContext) => Promise<void>): Promise<void> {
    // Enumerate through a SECURITY DEFINER function, not the RLS-scoped client:
    // a plain findMany here sets no tenant GUC, so under the non-owner runtime
    // role every policy predicate is `= NULL` and this returned zero brands —
    // which silently disabled every per-brand job in production.
    const brands = await this.prisma.$queryRaw<
      { id: string; groupId: string; platformId: string }[]
    >`SELECT id, group_id AS "groupId", platform_id AS "platformId" FROM public.worker_active_brands()`;
    for (const b of brands) {
      // One brand's failure must not stop the rest.
      await run(this.ctx(b.platformId, b.groupId, b.id)).catch((e) =>
        this.logger.error(`${job} failed for brand ${b.id}: ${(e as Error).message}`),
      );
    }
  }

  /** Every active group — settlement is group-scoped, not brand-scoped. */
  private async perGroup(job: string, run: (ctx: TenantContext) => Promise<void>): Promise<void> {
    const groups = await this.prisma.$queryRaw<
      { id: string; platformId: string }[]
    >`SELECT id, platform_id AS "platformId" FROM public.worker_active_groups()`;
    for (const g of groups) {
      await run(this.ctx(g.platformId, g.id, null)).catch((e) =>
        this.logger.error(`${job} failed for group ${g.id}: ${(e as Error).message}`),
      );
    }
  }

  /**
   * A system principal scoped to one tenant. `superadmin` is the only surface
   * that can act outside a signed-in session; the actor is marked `system` so
   * the audit trail says a job did this, not a person.
   */
  private ctx(platformId: string, groupId: string | null, brandId: string | null): TenantContext {
    return {
      platformId,
      groupId,
      brandId,
      branchId: null,
      scopeLevel: brandId ? 'brand' : 'group',
      surface: 'superadmin',
      actor: { type: 'system', id: platformId, onBehalfOf: null },
    };
  }
}
