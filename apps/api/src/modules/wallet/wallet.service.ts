import { Injectable } from '@nestjs/common';
import { ledger } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

/**
 * NestJS wrapper over the wallet operations of the ledger engine: group prepaid
 * top-up and the hybrid drawdown (issuance handled at earn; redemption draws
 * cost-per-point + platform margin). Breakage policy + endpoints arrive later.
 */
@Injectable()
export class WalletService {
  constructor(private readonly tenants: TenantService) {}

  topUp(ctx: TenantContext, args: ledger.TopUpArgs) {
    return this.tenants.run(ctx, (tx) => ledger.topUpWallet(tx, args));
  }

  drawdown(ctx: TenantContext, args: ledger.DrawdownArgs) {
    return this.tenants.run(ctx, (tx) => ledger.drawdownWallet(tx, args));
  }
}
