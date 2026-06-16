import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { WorkersModule } from '../workers/workers.module';
import { AppliersRegistry } from './appliers.registry';
import { BrandGovernanceController } from './brand-governance.controller';
import { GovernanceInterceptor } from './governance.interceptor';
import { GovernanceService } from './governance.service';
import { SuperadminGovernanceController } from './superadmin-governance.controller';

/**
 * Maker-checker governance (W2). The platform owner sets, per brand and per
 * capability, whether brand changes apply directly, queue for approval, or are
 * superadmin-managed. The AppliersRegistry is the shared singleton domain modules
 * register their entity CRUD into so approved requests can be applied generically.
 */
@Module({
  imports: [AuthModule, WorkersModule],
  controllers: [BrandGovernanceController, SuperadminGovernanceController],
  providers: [AppliersRegistry, GovernanceService, GovernanceInterceptor],
  exports: [AppliersRegistry, GovernanceService, GovernanceInterceptor],
})
export class GovernanceModule {}
