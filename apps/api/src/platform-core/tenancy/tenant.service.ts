import { Injectable } from '@nestjs/common';
import type { Prisma } from '@rfm-loyalty/db';
import { RLS_SETTINGS, type TenantContext } from '@rfm-loyalty/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Runs a unit of work inside a transaction with the tenant's RLS context applied
 * via `SET LOCAL app.current_*` (transaction-pooler safe — resets on commit).
 *
 * Fail-closed hierarchy: we set ONLY the GUC for the principal's scope level, so a
 * brand principal sets app.current_brand_id alone and can never reach another brand
 * (the group/platform clauses in the RLS policies stay false).
 */
@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    ctx: TenantContext,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.applyContext(tx, ctx);
      return work(tx);
    });
  }

  private async applyContext(tx: Prisma.TransactionClient, ctx: TenantContext): Promise<void> {
    const set = (key: string, value: string) =>
      tx.$executeRaw`SELECT set_config(${key}, ${value}, true)`;

    await set(RLS_SETTINGS.actor, ctx.actor.id);
    await set(RLS_SETTINGS.surface, ctx.surface);

    switch (ctx.scopeLevel) {
      case 'platform':
        await set(RLS_SETTINGS.platform, ctx.platformId);
        break;
      case 'group':
        await set(RLS_SETTINGS.group, ctx.groupId ?? '');
        break;
      case 'brand':
        await set(RLS_SETTINGS.brand, ctx.brandId ?? '');
        break;
      case 'branch':
        // Branch principals see their brand via RLS; the app-layer guard narrows
        // branch-scoped reads/writes to the specific branch.
        await set(RLS_SETTINGS.brand, ctx.brandId ?? '');
        await set(RLS_SETTINGS.branch, ctx.branchId ?? '');
        break;
    }
  }
}
