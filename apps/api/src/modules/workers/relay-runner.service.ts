import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TxnAlertService } from './txn-alert.service';

/**
 * Runs the transaction-alert relay on a plain interval, in-process.
 *
 * The BullMQ scheduler only ever *queued* repeatable jobs — no processor was
 * ever registered to consume them, and REDIS_URL isn't set in production, so
 * nothing has been running. A customer alert that arrives an hour late is worth
 * little, so this doesn't wait for that to be sorted out.
 *
 * Polling Postgres is the right tool here regardless: the outbox already lives
 * there, the volume is small, and `relay()` claims rows with SKIP LOCKED, so
 * running this on every instance is safe rather than merely tolerable.
 */
@Injectable()
export class RelayRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RelayRunner.name);
  private timer?: NodeJS.Timeout;
  /** Guards against a slow pass overlapping the next tick. */
  private running = false;

  constructor(
    private readonly alerts: TxnAlertService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env.SKIP_DB === '1' || process.env.NODE_ENV === 'test') return;
    const seconds = Number(this.config.get<string>('RELAY_INTERVAL_SECONDS') ?? 15);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      this.logger.warn('relay disabled (RELAY_INTERVAL_SECONDS <= 0)');
      return;
    }

    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    // Don't hold the process open on shutdown for the sake of a poll.
    this.timer.unref?.();
    this.logger.log(`transaction-alert relay running every ${seconds}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.alerts.relay();
    } catch (e) {
      // A failed pass must not kill the interval — the next tick retries.
      this.logger.error(`relay pass failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
