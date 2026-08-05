import { Module } from '@nestjs/common';
import { AppStatusController } from './app-status.controller';
import { AuthModule } from '../../auth/auth.module';
import { CustomerWalletController } from './wallet.controller';
import { AccountDeletionService } from './deletion.service';
import { CustomerWalletService } from './wallet.service';

/**
 * The customer app's person-level surface.
 *
 * Distinct from `WalletModule` (modules/wallet), which is the group's credit
 * wallet. This one is the customer's loyalty wallet: the cards, rewards and
 * activity a person holds across every brand they belong to.
 */
@Module({
  imports: [AuthModule],
  controllers: [CustomerWalletController, AppStatusController],
  providers: [CustomerWalletService, AccountDeletionService],
  exports: [CustomerWalletService, AccountDeletionService],
})
export class CustomerWalletModule {}
