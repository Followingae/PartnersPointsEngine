import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { WorkersModule } from '../workers/workers.module';
import { WebhookAdminController } from './webhook-admin.controller';

/** Brand webhook management UI surface (W4) over the existing WebhookService. */
@Module({
  imports: [AuthModule, WorkersModule],
  controllers: [WebhookAdminController],
})
export class WebhooksModule {}
