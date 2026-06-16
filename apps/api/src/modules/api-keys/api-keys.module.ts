import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';

/** Brand integration API-key management (W7). */
@Module({
  imports: [AuthModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeysModule {}
