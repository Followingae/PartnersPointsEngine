import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { WebhookService } from '../workers/webhook.service';
import { RegisterWebhookDto, UpdateWebhookDto } from './dto';

/** Brand-admin webhook management (W4) — endpoints, secret rotation, deliveries, test. */
@ApiTags('brand-admin')
@ApiBearerAuth('admin')
@Controller('manage/webhooks')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class WebhookAdminController {
  constructor(private readonly webhooks: WebhookService) {}

  @Get('event-types')
  @RequirePermissions('brand.report.read')
  eventTypes() {
    return this.webhooks.eventTypes();
  }

  @Get('deliveries')
  @RequirePermissions('brand.report.read')
  deliveries(@CurrentTenant() ctx: TenantContext, @Query('endpointId') endpointId?: string, @Query('status') status?: string) {
    return this.webhooks.listDeliveries(ctx, { endpointId, status });
  }

  @Get()
  @RequirePermissions('brand.report.read')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.webhooks.listEndpoints(ctx);
  }

  @Post()
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Register a webhook endpoint (signing secret returned once).' })
  register(@CurrentTenant() ctx: TenantContext, @Body() dto: RegisterWebhookDto) {
    return this.webhooks.register(ctx, dto.url, dto.events);
  }

  @Patch(':id')
  @RequirePermissions('brand.manage')
  update(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.webhooks.updateEndpoint(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('brand.manage')
  remove(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.webhooks.deleteEndpoint(ctx, id);
  }

  @Post(':id/rotate-secret')
  @RequirePermissions('brand.manage')
  rotate(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.webhooks.rotateSecret(ctx, id);
  }

  @Post(':id/test')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Fire a signed test event at the endpoint.' })
  test(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.webhooks.testFire(ctx, id);
  }
}
