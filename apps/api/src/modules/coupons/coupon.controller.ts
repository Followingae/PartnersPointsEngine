import { Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { CouponService } from './coupon.service';
import { BulkGenerateDto, CouponQueryDto, RedeemCouponDto, UpdateCouponDto } from './dto';

/** Brand-admin coupon / promo-code engine. */
@ApiTags('brand-admin')
@ApiBearerAuth('admin')
@Controller('manage/coupons')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class CouponController {
  constructor(private readonly coupons: CouponService) {}

  @Post('bulk-generate')
  @RequirePermissions('brand.campaign.write')
  @ApiOperation({ summary: 'Bulk-generate promo codes from a pattern.' })
  bulkGenerate(@CurrentTenant() ctx: TenantContext, @Body() dto: BulkGenerateDto) {
    return this.coupons.bulkGenerate(ctx, dto);
  }

  @Get()
  @RequirePermissions('brand.report.read')
  list(@CurrentTenant() ctx: TenantContext, @Query() query: CouponQueryDto) {
    return this.coupons.list(ctx, query);
  }

  @Get('batches')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Generated batches with usage rollups.' })
  batches(@CurrentTenant() ctx: TenantContext) {
    return this.coupons.batches(ctx);
  }

  @Get('export.csv')
  @RequirePermissions('brand.report.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="coupons.csv"')
  exportCsv(@CurrentTenant() ctx: TenantContext, @Query('batchId') batchId?: string) {
    return this.coupons.exportCsv(ctx, batchId);
  }

  @Post('validate')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Validate a code (no redemption).' })
  validate(@CurrentTenant() ctx: TenantContext, @Body() dto: RedeemCouponDto) {
    return this.coupons.validate(ctx, dto.code, dto.membershipId);
  }

  @Post('redeem')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Redeem a code (validates + records redemption).' })
  redeem(@CurrentTenant() ctx: TenantContext, @Body() dto: RedeemCouponDto) {
    return this.coupons.redeem(ctx, dto.code, dto.membershipId);
  }

  @Patch(':id')
  @RequirePermissions('brand.campaign.write')
  update(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(ctx, id, dto);
  }
}
