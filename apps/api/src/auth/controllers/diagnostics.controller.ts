import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { CurrentTenant } from '../decorators/current-tenant.decorator';
import { AdminJwtGuard } from '../guards/admin-jwt.guard';
import { CustomerJwtGuard } from '../guards/customer-jwt.guard';
import { TerminalHmacGuard } from '../guards/terminal-hmac.guard';
import { RequirePermissions } from '../authz/permissions.decorator';
import { PermissionsGuard } from '../authz/permissions.guard';

/**
 * Phase-1 diagnostics. `visible-*` counts are computed through TenantService, so
 * when the API connects as the RLS-enforced `loyalty_app` role they DEMONSTRATE
 * tenant isolation: a brand admin sees 1 brand, a superadmin sees all.
 */
@ApiTags('system')
@ApiBearerAuth('admin')
@Controller('admin/diagnostics')
export class AdminDiagnosticsController {
  constructor(private readonly tenants: TenantService) {}

  @Get('whoami')
  @UseGuards(AdminJwtGuard)
  whoami(@CurrentTenant() tenant: TenantContext): TenantContext {
    return tenant;
  }

  @Get('visible-brands')
  @UseGuards(AdminJwtGuard, PermissionsGuard)
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Counts rows visible under RLS for the caller (isolation proof).' })
  visibleBrands(@CurrentTenant() tenant: TenantContext) {
    return this.tenants.run(tenant, async (tx) => ({
      scopeLevel: tenant.scopeLevel,
      groups: await tx.group.count(),
      brands: await tx.brand.count(),
      branches: await tx.branch.count(),
      memberships: await tx.customerMembership.count(),
    }));
  }
}

@ApiTags('system')
@ApiBearerAuth('customer')
@Controller('customer/diagnostics')
export class CustomerDiagnosticsController {
  @Get('whoami')
  @UseGuards(CustomerJwtGuard)
  whoami(@CurrentTenant() tenant: TenantContext): TenantContext {
    return tenant;
  }
}

@ApiTags('system')
@Controller('terminal/diagnostics')
export class TerminalDiagnosticsController {
  @Get('ping')
  @UseGuards(TerminalHmacGuard)
  ping(@CurrentTenant() tenant: TenantContext) {
    return { ok: true, brandId: tenant.brandId, actor: tenant.actor };
  }
}
