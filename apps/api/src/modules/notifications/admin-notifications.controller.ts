import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { NotificationService } from './notification.service';

/**
 * Superadmin notification centre: a platform principal sees platform-audience
 * notifications across the estate (RLS matches on the platform GUC). Brand-scoped
 * notifications stay with their brand; the platform feed is the cross-brand one.
 */
@ApiTags('notifications')
@Controller('admin/notifications')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'List platform notifications across all brands.' })
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query('status') status?: 'unread' | 'all',
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(ctx, 'platform', { status, limit: limit ? Number(limit) : undefined });
  }

  @Get('unread-count')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Unread notification count for the bell badge.' })
  async unreadCount(@CurrentTenant() ctx: TenantContext) {
    return { count: await this.notifications.unreadCount(ctx, 'platform') };
  }

  @Post(':id/read')
  @RequirePermissions('platform.report.read')
  read(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.notifications.markRead(ctx, 'platform', id);
  }

  @Post('read-all')
  @RequirePermissions('platform.report.read')
  readAll(@CurrentTenant() ctx: TenantContext) {
    return this.notifications.markAllRead(ctx, 'platform');
  }
}
