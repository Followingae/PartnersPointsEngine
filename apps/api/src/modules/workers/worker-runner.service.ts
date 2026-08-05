import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@rfm-loyalty/shared';
import { PrismaService } from '../../platform-core/prisma/prisma.service';
import { ExpirySweepService } from './expiry-sweep.service';
import { AccountDeletionService } from '../customer-wallet/deletion.service';
import { SettlementService } from './settlement.service';
import { TxnAlertService } from './txn-alert.service';
import { WebhookService } from './webhook.service';

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

    this.logger.log(
      'background jobs running: txn-alerts, webhooks, settlement, point-expiry, account-deletions',
    );
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
    const brands = await this.prisma.brand.findMany({
      where: { status: 'active' },
      select: { id: true, groupId: true, platformId: true },
    });
    for (const b of brands) {
      // One brand's failure must not stop the rest.
      await run(this.ctx(b.platformId, b.groupId, b.id)).catch((e) =>
        this.logger.error(`${job} failed for brand ${b.id}: ${(e as Error).message}`),
      );
    }
  }

  /** Every active group — settlement is group-scoped, not brand-scoped. */
  private async perGroup(job: string, run: (ctx: TenantContext) => Promise<void>): Promise<void> {
    const groups = await this.prisma.group.findMany({
      where: { status: 'active' },
      select: { id: true, platformId: true },
    });
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
