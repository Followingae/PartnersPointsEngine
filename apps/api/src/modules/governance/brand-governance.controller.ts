import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { ChangeRequestQueryDto, SubmitChangeRequestDto } from './dto';
import { GovernanceService } from './governance.service';

/** Brand-side change requests (the "maker" half of maker-checker). */
@ApiTags('brand-admin')
@ApiBearerAuth('admin')
@Controller('manage/change-requests')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class BrandGovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Post()
  @RequirePermissions('brand.campaign.write')
  @ApiOperation({ summary: 'Submit a proposed change for superadmin approval.' })
  submit(@CurrentTenant() ctx: TenantContext, @Body() dto: SubmitChangeRequestDto) {
    return this.governance.submit(ctx, dto);
  }

  @Get()
  @RequirePermissions('brand.report.read')
  list(@CurrentTenant() ctx: TenantContext, @Query() query: ChangeRequestQueryDto) {
    return this.governance.listForBrand(ctx, query);
  }

  @Get(':id')
  @RequirePermissions('brand.report.read')
  get(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.governance.getForBrand(ctx, id);
  }

  @Delete(':id')
  @RequirePermissions('brand.campaign.write')
  @ApiOperation({ summary: 'Withdraw a pending change request.' })
  withdraw(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.governance.withdraw(ctx, id);
  }
}
