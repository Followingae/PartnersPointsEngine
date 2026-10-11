import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { BrandNotificationsController } from './brand-notifications.controller';
import { NotificationService } from './notification.service';

/**
 * Operator notification centre. TenantService comes from the global
 * PlatformCoreModule; AuthModule provides the guards the controllers reference.
 * NotificationService is exported so other modules (the fraud module first) can
 * publish into the feed.
 */
@Module({
  imports: [AuthModule],
  controllers: [BrandNotificationsController, AdminNotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
