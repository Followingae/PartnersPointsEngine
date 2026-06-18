import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { TopupRequestDto } from './dto';
import { PartnershipService } from './partnership.service';

/** Brand console: the brand's own partner (Lulu) status, allowance, reports, activity. */
@ApiTags('partnerships')
@ApiBearerAuth('admin')
@Controller('manage/lulu')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class BrandPartnershipsController {
  constructor(private readonly partnerships: PartnershipService) {}

  @Get('status')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'This brand’s Lulu enablement, ratio, and allowance balance.' })
  status(@CurrentTenant() ctx: TenantContext) {
    return this.partnerships.brandStatus(ctx);
  }

  @Get('reports')
  @RequirePermissions('brand.report.read')
  reports(@CurrentTenant() ctx: TenantContext, @Query('days') days?: string) {
    return this.partnerships.brandReports(ctx, days ? Number(days) : 30);
  }

  @Get('activity')
  @RequirePermissions('brand.report.read')
  activity(@CurrentTenant() ctx: TenantContext) {
    return this.partnerships.brandActivity(ctx);
  }

  @Get('activity.csv')
  @RequirePermissions('brand.report.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="lulu-conversions.csv"')
  @ApiOperation({ summary: 'Export this brand’s conversions as CSV.' })
  activityCsv(@CurrentTenant() ctx: TenantContext) {
    return this.partnerships.exportBrandConversionsCsv(ctx);
  }

  @Get('conversions/:id')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'A single conversion with customer + allowance detail.' })
  conversion(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.partnerships.getConversion(ctx, id);
  }

  @Get('ledger')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Allowance wallet ledger (top-ups + spend).' })
  ledger(@CurrentTenant() ctx: TenantContext) {
    return this.partnerships.allowanceLedger(ctx);
  }

  @Get('topups')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'This brand’s allowance top-up requests.' })
  topups(@CurrentTenant() ctx: TenantContext) {
    return this.partnerships.myTopupRequests(ctx);
  }

  @Post('topup-request')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Initiate an allowance top-up (superadmin invoices + confirms).' })
  topupRequest(@CurrentTenant() ctx: TenantContext, @Body() dto: TopupRequestDto) {
    return this.partnerships.requestTopup(ctx, dto.amountMinor, dto.note);
  }
}
