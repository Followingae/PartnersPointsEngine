import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { NotificationService } from './notification.service';

/**
 * Brand notification centre: a brand admin sees and dismisses notifications for
 * their own brand (RLS matches on the brand GUC). Dismissing only touches this
 * operator's own read state, so it needs no more than report-read.
 */
@ApiTags('notifications')
@Controller('manage/notifications')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class BrandNotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'List notifications for this brand.' })
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query('status') status?: 'unread' | 'all',
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(ctx, 'brand', { status, limit: limit ? Number(limit) : undefined });
  }

  @Get('unread-count')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Unread notification count for the bell badge.' })
  async unreadCount(@CurrentTenant() ctx: TenantContext) {
    return { count: await this.notifications.unreadCount(ctx, 'brand') };
  }

  @Post(':id/read')
  @RequirePermissions('brand.report.read')
  read(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.notifications.markRead(ctx, 'brand', id);
  }

  @Post('read-all')
  @RequirePermissions('brand.report.read')
  readAll(@CurrentTenant() ctx: TenantContext) {
    return this.notifications.markAllRead(ctx, 'brand');
  }
}
