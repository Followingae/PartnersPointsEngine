import { Injectable, Logger } from '@nestjs/common';
import { ledger } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

/**
 * Group-wallet settlement worker (Phase 5). Captured POS redemptions are settled
 * asynchronously against the group's prepaid wallet (the terminal context is
 * brand-scoped; the wallet is group-scoped). Runs under a GROUP-scoped context,
 * idempotent per terminal transaction.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(private readonly tenants: TenantService) {}

  /** Settle all captured-but-unsettled redemptions for the group in ctx. */
  async settleGroup(ctx: TenantContext): Promise<{ settled: number; drawnMinor: string }> {
    const ids = await this.tenants.run(ctx, (tx) =>
      tx.terminalTransaction
        .findMany({
          where: { groupId: ctx.groupId!, intent: 'redeem', state: 'captured', settledAt: null },
          select: { id: true },
          take: 200,
        })
        .then((rows) => rows.map((r) => r.id)),
    );

    let drawn = 0n;
    let settled = 0;
    for (const id of ids) {
      try {
        drawn += await this.settleOne(ctx, id);
        settled += 1;
      } catch (e) {
        this.logger.warn(`settlement failed for ${id}: ${e instanceof Error ? e.message : e}`);
        // Left unsettled for retry / low-balance alerting.
      }
    }
    return { settled, drawnMinor: drawn.toString() };
  }

  private async settleOne(ctx: TenantContext, txnId: string): Promise<bigint> {
    return this.tenants.run(ctx, async (tx) => {
      const t = await tx.terminalTransaction.findUnique({ where: { id: txnId } });
      if (!t || t.settledAt || t.state !== 'captured' || t.intent !== 'redeem' || !t.points) return 0n;

      const rule = await tx.costRule.findFirst({ where: { groupId: ctx.groupId! }, orderBy: { effectiveFrom: 'desc' } });
      const wallet = await tx.groupWallet.findUnique({ where: { groupId: ctx.groupId! } });
      const currency = wallet?.currency ?? 'AED';
      const cpp = rule?.costPerPointMinor ?? 0n;
      const bps = rule?.platformMarginBps ?? 0;

      if (cpp === 0n) {
        await tx.terminalTransaction.update({ where: { id: t.id }, data: { settledAt: new Date() } });
        return 0n;
      }
      const dd = await ledger.drawdownWallet(tx, {
        scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: null },
        currency,
        points: t.points,
        costPerPointMinor: cpp,
        platformMarginBps: bps,
        occurredAt: new Date(),
        sourceEvent: `settle:${t.id}`,
        idem: { actorId: ctx.actor.id, key: `settle:${t.id}` },
      });
      await tx.terminalTransaction.update({
        where: { id: t.id },
        data: { settledAt: new Date(), drawdownJournalId: dd.journalId },
      });
      return dd.totalMinor;
    });
  }
}
