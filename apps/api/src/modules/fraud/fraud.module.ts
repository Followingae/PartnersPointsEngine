import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AdminFraudController } from './admin-fraud.controller';
import { BrandFraudController } from './brand-fraud.controller';
import { FraudService } from './fraud.service';

/**
 * Fraud protection. TenantService + EmailService come from the global
 * PlatformCoreModule; AuthModule provides the guards the controllers reference.
 * FraudService is exported so the background scheduler can run periodic scans.
 */
@Module({
  imports: [AuthModule],
  controllers: [BrandFraudController, AdminFraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
