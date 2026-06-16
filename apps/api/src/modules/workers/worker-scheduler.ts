import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Schedules recurring background jobs on BullMQ (Redis) — settlement, webhook
 * relay/delivery, point-expiry sweeps. BullMQ is loaded lazily and only when
 * REDIS_URL is configured, so the app (and tests / OpenAPI generation) boot
 * cleanly without Redis. Per-tenant fan-out inside each job is finalized in Phase 6.
 */
@Injectable()
export class WorkerScheduler implements OnModuleInit {
  private readonly logger = new Logger(WorkerScheduler.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (process.env.SKIP_DB === '1' || !redisUrl) {
      this.logger.log('Background scheduler disabled (no REDIS_URL); workers run on demand.');
      return;
    }
    try {
      const { Queue } = await import('bullmq');
      const queue = new Queue('rfm-maintenance', { connection: { url: redisUrl } as never });
      await queue.add('settlement', {}, { repeat: { every: 60_000 }, removeOnComplete: true });
      await queue.add('webhooks', {}, { repeat: { every: 30_000 }, removeOnComplete: true });
      await queue.add('point-expiry', {}, { repeat: { pattern: '0 2 * * *' }, removeOnComplete: true });
      this.logger.log('Background scheduler enabled (BullMQ): settlement, webhooks, point-expiry.');
      // NOTE: the Worker processors (which iterate tenants and call the services)
      // are registered in a dedicated worker process in deployment.
    } catch (e) {
      this.logger.warn(`Scheduler init skipped: ${e instanceof Error ? e.message : e}`);
    }
  }
}
