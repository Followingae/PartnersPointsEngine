import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { BulkDecisionDto, ChangeRequestQueryDto, RejectDto, SetGovernanceDto } from './dto';
import { GovernanceService } from './governance.service';

/** Superadmin governance: the approvals queue (the "checker" half) + per-brand config. */
@ApiTags('superadmin')
@ApiBearerAuth('admin')
@Controller('admin')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class SuperadminGovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('change-requests')
  @RequirePermissions('platform.report.read')
  list(@CurrentTenant() ctx: TenantContext, @Query() query: ChangeRequestQueryDto) {
    return this.governance.listAll(ctx, query);
  }

  @Get('change-requests/:id')
  @RequirePermissions('platform.report.read')
  get(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.governance.getOne(ctx, id);
  }

  @Patch('change-requests/:id/approve')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Approve a change request — applies it to the brand and audits the decision.' })
  approve(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.governance.approve(ctx, id);
  }

  @Patch('change-requests/:id/reject')
  @RequirePermissions('platform.manage')
  reject(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: RejectDto) {
    return this.governance.reject(ctx, id, dto.decisionReason);
  }

  @Post('change-requests/bulk-approve')
  @RequirePermissions('platform.manage')
  bulkApprove(@CurrentTenant() ctx: TenantContext, @Body() dto: BulkDecisionDto) {
    return this.governance.bulkApprove(ctx, dto.ids);
  }

  @Post('change-requests/bulk-reject')
  @RequirePermissions('platform.manage')
  bulkReject(@CurrentTenant() ctx: TenantContext, @Body() dto: BulkDecisionDto) {
    return this.governance.bulkReject(ctx, dto.ids, dto.decisionReason);
  }

  @Get('governance-stats')
  @RequirePermissions('platform.report.read')
  stats(@CurrentTenant() ctx: TenantContext) {
    return this.governance.stats(ctx);
  }

  @Get('brands/:brandId/governance')
  @RequirePermissions('platform.report.read')
  getGovernance(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string) {
    return this.governance.getBrandGovernance(ctx, brandId);
  }

  @Patch('brands/:brandId/governance')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Set a brand default + per-capability governance modes.' })
  setGovernance(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string, @Body() dto: SetGovernanceDto) {
    return this.governance.setBrandGovernance(ctx, brandId, dto);
  }
}
