import { Injectable } from '@nestjs/common';
import type { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';

/**
 * Transactional outbox emitter. Call `emit` with the SAME transaction as the
 * domain change so the event is only published if the change commits. A relay
 * worker (WebhookService.relayOutbox) later fans rows out to webhook deliveries.
 */
@Injectable()
export class OutboxService {
  async emit(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    aggregate: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.outbox.create({
      data: {
        aggregate,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        platformId: ctx.platformId,
        groupId: ctx.groupId ?? ctx.platformId,
        brandId: ctx.brandId ?? null,
      },
    });
  }
}
