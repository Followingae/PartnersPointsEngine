import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { FraudService } from './fraud.service';

/**
 * Superadmin fraud console: a platform principal sees alerts across every brand
 * (RLS matches on the platform GUC). Read + act; thresholds are configured per
 * brand through the brand console.
 */
@ApiTags('fraud')
@Controller('admin/fraud')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class AdminFraudController {
  constructor(private readonly fraud: FraudService) {}

  @Get('alerts')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'List fraud alerts across all brands.' })
  alerts(@CurrentTenant() ctx: TenantContext, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.fraud.listAlerts(ctx, { status, limit: limit ? Number(limit) : undefined });
  }

  @Post('alerts/:id/acknowledge')
  @RequirePermissions('platform.manage')
  acknowledge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.fraud.acknowledge(ctx, id);
  }

  @Post('alerts/:id/resolve')
  @RequirePermissions('platform.manage')
  resolve(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Query('dismiss') dismiss?: string) {
    return this.fraud.resolve(ctx, id, dismiss === 'true');
  }
}
