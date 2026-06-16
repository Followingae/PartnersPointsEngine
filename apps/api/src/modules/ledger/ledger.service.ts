import { Injectable } from '@nestjs/common';
import { ledger } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

/**
 * NestJS wrapper over the framework-agnostic ledger engine (@rfm-loyalty/db).
 * Runs each operation inside the tenant transaction (RLS context applied), so
 * points data stays closed-loop per brand. The correctness logic + tests live
 * in the engine; this layer only binds tenant context. Endpoints arrive in Phase 3.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly tenants: TenantService) {}

  earn(ctx: TenantContext, args: ledger.EarnArgs) {
    return this.tenants.run(ctx, (tx) => ledger.earnPoints(tx, args));
  }

  authorizeRedeem(ctx: TenantContext, args: ledger.RedeemArgs) {
    return this.tenants.run(ctx, (tx) => ledger.authorizeRedeem(tx, args));
  }

  captureRedeem(ctx: TenantContext, args: ledger.RedeemArgs) {
    return this.tenants.run(ctx, (tx) => ledger.captureRedeem(tx, args));
  }

  voidRedeem(ctx: TenantContext, args: ledger.RedeemArgs) {
    return this.tenants.run(ctx, (tx) => ledger.voidRedeem(tx, args));
  }

  balance(ctx: TenantContext, accountId: string) {
    return this.tenants.run(ctx, (tx) => ledger.getBalance(tx, accountId));
  }
}
