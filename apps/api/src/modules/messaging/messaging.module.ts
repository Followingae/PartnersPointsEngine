import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

/** Messaging templates (W4) — CRUD + variable interpolation preview. */
@Module({
  imports: [AuthModule],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
