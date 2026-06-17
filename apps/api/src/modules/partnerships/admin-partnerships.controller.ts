import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { EnableMerchantDto, FundAllowanceDto, ThresholdDto, UpdateMerchantDto, UpdatePartnerDto } from './dto';
import { PartnershipService } from './partnership.service';

/** Superadmin: partner config, per-merchant enablement, allowance, and reports. */
@ApiTags('partnerships')
@ApiBearerAuth('admin')
@Controller('admin/partners')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class AdminPartnershipsController {
  constructor(private readonly partnerships: PartnershipService) {}

  @Get()
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'List partners with enablement + allowance rollups.' })
  list(@CurrentTenant() ctx: TenantContext) {
    return this.partnerships.listPartners(ctx);
  }

  @Post('lulu/ensure')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Create the Lulu partner if it does not exist yet.' })
  ensureLulu(@CurrentTenant() ctx: TenantContext) {
    return this.partnerships.ensureLulu(ctx);
  }

  @Patch('merchants/:id')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Update a partner-merchant (ratio, status, caps).' })
  updateMerchant(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateMerchantDto) {
    return this.partnerships.updateMerchant(ctx, id, dto);
  }

  @Get(':partnerId')
  @RequirePermissions('platform.report.read')
  getPartner(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string) {
    return this.partnerships.getPartner(ctx, partnerId);
  }

  @Patch(':partnerId')
  @RequirePermissions('platform.manage')
  updatePartner(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string, @Body() dto: UpdatePartnerDto) {
    return this.partnerships.updatePartner(ctx, partnerId, dto);
  }

  @Get(':partnerId/health')
  @RequirePermissions('platform.report.read')
  health(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string) {
    return this.partnerships.health(ctx, partnerId);
  }

  @Get(':partnerId/merchants')
  @RequirePermissions('platform.report.read')
  listMerchants(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string) {
    return this.partnerships.listMerchants(ctx, partnerId);
  }

  @Post(':partnerId/merchants')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Enable a brand for this partner (creates allowance + turns on the module).' })
  enableMerchant(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string, @Body() dto: EnableMerchantDto) {
    return this.partnerships.enableMerchant(ctx, { partnerId, ...dto });
  }

  @Post(':partnerId/allowance/fund')
  @RequirePermissions('platform.manage')
  fundAllowance(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string, @Body() dto: FundAllowanceDto) {
    return this.partnerships.fundAllowance(ctx, { partnerId, brandId: dto.brandId, amountMinor: dto.amountMinor });
  }

  @Post(':partnerId/allowance/threshold')
  @RequirePermissions('platform.manage')
  setThreshold(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string, @Body() dto: ThresholdDto) {
    return this.partnerships.setThreshold(ctx, { partnerId, brandId: dto.brandId, thresholdMinor: dto.thresholdMinor });
  }

  @Get(':partnerId/overview')
  @RequirePermissions('platform.report.read')
  overview(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string, @Query('days') days?: string) {
    return this.partnerships.overview(ctx, partnerId, days ? Number(days) : 30);
  }

  @Get(':partnerId/trend')
  @RequirePermissions('platform.report.read')
  trend(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string, @Query('days') days?: string) {
    return this.partnerships.trend(ctx, partnerId, days ? Number(days) : 30);
  }

  @Get(':partnerId/conversions')
  @RequirePermissions('platform.report.read')
  conversions(@CurrentTenant() ctx: TenantContext, @Param('partnerId') partnerId: string, @Query('status') status?: string) {
    return this.partnerships.listConversions(ctx, partnerId, status);
  }
}
