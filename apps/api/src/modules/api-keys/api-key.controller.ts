import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { ApiKeyService } from './api-key.service';

/** Brand integration API keys (W7). */
@ApiTags('brand-admin')
@ApiBearerAuth('admin')
@Controller('manage/api-keys')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class ApiKeyController {
  constructor(private readonly keys: ApiKeyService) {}

  @Get()
  @RequirePermissions('brand.report.read')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.keys.list(ctx);
  }

  @Post()
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Issue a new integration API key (secret returned once).' })
  create(@CurrentTenant() ctx: TenantContext) {
    return this.keys.create(ctx);
  }

  @Post(':id/rotate')
  @RequirePermissions('brand.manage')
  rotate(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.keys.rotate(ctx, id);
  }

  @Delete(':id')
  @RequirePermissions('brand.manage')
  revoke(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.keys.revoke(ctx, id);
  }
}
