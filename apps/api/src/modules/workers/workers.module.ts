import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ExpirySweepService } from './expiry-sweep.service';
import { OutboxService } from './outbox.service';
import { SettlementService } from './settlement.service';
import { WebhookService } from './webhook.service';
import { WorkerScheduler } from './worker-scheduler';

/**
 * Workers module (Phase 5) — async settlement of POS redemptions against the
 * group wallet, transactional-outbox relay, and HMAC-signed webhook delivery.
 * Job scheduling runs on BullMQ/Redis (WorkerScheduler); the services are also
 * callable on demand and are unit-tested directly.
 */
@Module({
  imports: [AuthModule], // EnvelopeCryptoService for webhook secrets
  providers: [SettlementService, OutboxService, WebhookService, ExpirySweepService, WorkerScheduler],
  exports: [SettlementService, OutboxService, WebhookService, ExpirySweepService],
})
export class WorkersModule {}
