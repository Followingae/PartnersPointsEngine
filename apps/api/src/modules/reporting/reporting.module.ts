import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AnalyticsService } from './analytics.service';
import { AdminReportsController, ManageReportsController } from './reporting.controller';
import { ReportingService } from './reporting.service';

/**
 * Reporting module (Phase 6) — CQRS read models / rollups, RFM segmentation, and
 * brand + superadmin reports, all computed from (and rebuildable from) the ledger.
 * Reads should hit a replica in production; the queries are replica-safe.
 */
@Module({
  imports: [AuthModule],
  controllers: [ManageReportsController, AdminReportsController],
  providers: [ReportingService, AnalyticsService],
  exports: [ReportingService, AnalyticsService],
})
export class ReportingModule {}
