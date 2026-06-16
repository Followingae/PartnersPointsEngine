import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { SegmentController } from './segment.controller';
import { SegmentService } from './segment.service';

/** Audience / segment builder (W4) — rule-based member targeting. */
@Module({
  imports: [AuthModule],
  controllers: [SegmentController],
  providers: [SegmentService],
  exports: [SegmentService],
})
export class SegmentsModule {}
