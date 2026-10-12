import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import type { TenantContext } from '@rfm-loyalty/shared';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { FraudService } from './fraud.service';

class SetFraudRuleDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @Matches(/^\d+$/) thresholdNum?: string;
  @IsOptional() @IsInt() @Min(60) windowSeconds?: number;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'critical']) severity?: string;
  @IsOptional() @IsIn(['alert', 'flag', 'block']) action?: string;
}

class ResolveDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

/**
 * Superadmin fraud console. The platform owns fraud governance: it configures each
 * brand's rules, sees cases across every brand, and is the only authority that can
 * close a case (resolve/dismiss) or decide a brand's review request.
 */
@ApiTags('fraud')
@Controller('admin/fraud')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class AdminFraudController {
  constructor(private readonly fraud: FraudService) {}

  // ── Per-brand rule configuration (platform-owned) ──────────────────────────
  @Get('brands')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Active brands with their open-case and rule-override counts.' })
  brands(@CurrentTenant() ctx: TenantContext) {
    return this.fraud.brandsOverview(ctx);
  }

  @Get('brands/:brandId/rules')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'The effective rule set for one brand (defaults merged with overrides).' })
  brandRules(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string) {
    return this.fraud.effectiveRulesForBrand(ctx, brandId);
  }

  @Patch('brands/:brandId/rules/:key')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Set a fraud rule for a brand (superadmin only).' })
  setBrandRule(
    @CurrentTenant() ctx: TenantContext,
    @Param('brandId') brandId: string,
    @Param('key') key: string,
    @Body() dto: SetFraudRuleDto,
  ) {
    return this.fraud.setRuleForBrand(ctx, brandId, key, dto);
  }

  // ── Cases across every brand ───────────────────────────────────────────────
  @Get('alerts')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'List fraud cases across all brands.' })
  alerts(
    @CurrentTenant() ctx: TenantContext,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.fraud.listAlerts(ctx, { status, brandId, limit: limit ? Number(limit) : undefined });
  }

  @Post('alerts/:id/acknowledge')
  @RequirePermissions('platform.manage')
  acknowledge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.fraud.acknowledge(ctx, id);
  }

  @Post('alerts/:id/resolve')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Close a case. ?dismiss=true marks it a false alarm.' })
  resolve(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Query('dismiss') dismiss?: string,
    @Body() dto?: ResolveDto,
  ) {
    return this.fraud.resolve(ctx, id, dismiss === 'true', dto?.note);
  }

  @Post('alerts/:id/reject-review')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: "Decline a brand's review request; the case returns to acknowledged." })
  rejectReview(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto?: ResolveDto) {
    return this.fraud.rejectReview(ctx, id, dto?.note);
  }
}
