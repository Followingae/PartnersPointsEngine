import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

/** Superadmin module — merchant onboarding + wallet credit + platform config. */
@Module({
  imports: [AuthModule, WalletModule],
  controllers: [SuperadminController],
  providers: [SuperadminService],
  exports: [SuperadminService],
})
export class SuperadminModule {}
