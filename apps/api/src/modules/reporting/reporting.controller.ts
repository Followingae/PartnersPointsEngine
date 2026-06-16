import { Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { AnalyticsService } from './analytics.service';
import { ReportingService } from './reporting.service';

/** Brand-admin reporting — scoped strictly to the caller's brand. */
@ApiTags('reporting')
@ApiBearerAuth('admin')
@Controller('manage/reports')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class ManageReportsController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('summary')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Brand KPIs: points earned/redeemed, outstanding liability, members.' })
  summary(@CurrentTenant() ctx: TenantContext) {
    return this.reporting.brandSummary(ctx);
  }

  @Get('rfm')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Per-member RFM scores + segments.' })
  rfm(@CurrentTenant() ctx: TenantContext) {
    return this.reporting.rfm(ctx);
  }

  @Get('trend')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Daily points earned/redeemed (last 14 days).' })
  trend(@CurrentTenant() ctx: TenantContext) {
    return this.reporting.pointsTrend(ctx);
  }

  @Get('by-type')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Points earned/redeemed split by loyalty type (online vs in-store), last 14 days.' })
  byType(@CurrentTenant() ctx: TenantContext) {
    return this.reporting.pointsByType(ctx);
  }

  @Get('rfm.csv')
  @RequirePermissions('brand.report.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="rfm.csv"')
  @ApiOperation({ summary: 'Export RFM segments as CSV.' })
  rfmCsv(@CurrentTenant() ctx: TenantContext) {
    return this.reporting.rfmCsv(ctx);
  }

  @Post('rollup')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Recompute the daily metric rollup for today.' })
  rollup(@CurrentTenant() ctx: TenantContext) {
    return this.reporting.runDailyRollup(ctx);
  }

  @Post('rfm-snapshot')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Persist an RFM snapshot (point-in-time).' })
  snapshot(@CurrentTenant() ctx: TenantContext) {
    return this.reporting.snapshotRfm(ctx);
  }

  // ── analytics suite (W3) ───────────────────────────────────────────────────
  @Get('clv')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Customer Lifetime Value — summary, distribution, top members.' })
  clv(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.clv(ctx);
  }

  @Get('visit-frequency')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Visit-frequency histogram + most-frequent-visitor leaderboard.' })
  visitFrequency(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.visitFrequency(ctx);
  }

  @Get('cohorts')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Signup-month cohort retention matrix.' })
  cohorts(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.cohortRetention(ctx);
  }

  @Get('churn-risk')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Churn-risk buckets by recency + at-risk member list.' })
  churnRisk(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.churnRisk(ctx);
  }

  @Get('liability-aging')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Outstanding points scheduled to expire by month.' })
  liabilityAging(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.liabilityAging(ctx);
  }

  @Get('by-branch')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Per-branch earn / redeem / member breakdown.' })
  byBranch(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.byBranch(ctx);
  }

  @Get('engagement')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Onboarding funnel + repeat-purchase rate.' })
  engagement(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.engagement(ctx);
  }

  @Get('clv.csv')
  @RequirePermissions('brand.report.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="clv.csv"')
  clvCsv(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.clvCsv(ctx);
  }

  @Get('visit-frequency.csv')
  @RequirePermissions('brand.report.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="visit-frequency.csv"')
  visitFrequencyCsv(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.visitFrequencyCsv(ctx);
  }

  @Get('churn-risk.csv')
  @RequirePermissions('brand.report.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="churn-risk.csv"')
  churnCsv(@CurrentTenant() ctx: TenantContext) {
    return this.analytics.churnCsv(ctx);
  }
}

/** Superadmin platform-wide reporting. */
@ApiTags('reporting')
@ApiBearerAuth('admin')
@Controller('admin/reports')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class AdminReportsController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('overview')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Platform totals: points liability, wallet balances, volumes.' })
  overview(@CurrentTenant() ctx: TenantContext) {
    return this.reporting.superadminOverview(ctx);
  }
}
