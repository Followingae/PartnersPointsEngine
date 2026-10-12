import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { TenantContext } from '@rfm-loyalty/shared';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { FraudService } from './fraud.service';

class RequestReviewDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

/**
 * Brand-facing fraud console: a brand admin sees ONLY their brand. Fraud rules are
 * owned by the platform — a brand cannot set its own thresholds, and cannot close a
 * case directly. It can see its protection status and recent cases, acknowledge a
 * case, and *request a review* (a time-bound ask the superadmin then acts on).
 */
@ApiTags('fraud')
@Controller('manage/fraud')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class BrandFraudController {
  constructor(private readonly fraud: FraudService) {}

  @Get('rules')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'List the protections active for this brand (read-only; the platform owns the thresholds).' })
  rules(@CurrentTenant() ctx: TenantContext) {
    return this.fraud.effectiveRules(ctx);
  }

  @Get('alerts')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'List fraud cases for this brand.' })
  alerts(@CurrentTenant() ctx: TenantContext, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.fraud.listAlerts(ctx, { status, limit: limit ? Number(limit) : undefined });
  }

  @Post('alerts/:id/acknowledge')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Mark that this brand has seen a case.' })
  acknowledge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.fraud.acknowledge(ctx, id);
  }

  @Post('alerts/:id/request-review')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Ask the platform to review a case (e.g. a suspected false alarm). Time-bound.' })
  requestReview(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: RequestReviewDto) {
    return this.fraud.requestReview(ctx, id, dto.reason ?? '');
  }
}
