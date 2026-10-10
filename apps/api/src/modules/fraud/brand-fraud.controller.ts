import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
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

/** Brand-facing fraud console: a brand admin sees and manages ONLY their brand. */
@ApiTags('fraud')
@Controller('manage/fraud')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class BrandFraudController {
  constructor(private readonly fraud: FraudService) {}

  @Get('rules')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'List fraud rules (defaults merged with this brand overrides).' })
  rules(@CurrentTenant() ctx: TenantContext) {
    return this.fraud.effectiveRules(ctx);
  }

  @Patch('rules/:key')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Override a fraud rule threshold for this brand.' })
  setRule(@CurrentTenant() ctx: TenantContext, @Param('key') key: string, @Body() dto: SetFraudRuleDto) {
    return this.fraud.setRule(ctx, key, dto);
  }

  @Get('alerts')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'List fraud alerts for this brand.' })
  alerts(@CurrentTenant() ctx: TenantContext, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.fraud.listAlerts(ctx, { status, limit: limit ? Number(limit) : undefined });
  }

  @Post('alerts/:id/acknowledge')
  @RequirePermissions('brand.manage')
  acknowledge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.fraud.acknowledge(ctx, id);
  }

  @Post('alerts/:id/resolve')
  @RequirePermissions('brand.manage')
  resolve(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Query('dismiss') dismiss?: string) {
    return this.fraud.resolve(ctx, id, dismiss === 'true');
  }
}
