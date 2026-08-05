import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformCoreModule } from '../../platform-core/platform-core.module';
import { AppleWalletService } from './apple-wallet.service';
import { GoogleWalletService } from './google-wallet.service';
import { ApplePassLinkController, WalletPassController } from './wallet-pass.controller';
import { WalletPassService } from './wallet-pass.service';

/**
 * Wallet passes — Apple and Google.
 *
 * Exports WalletPassService so the loyalty path can refresh a saved card after
 * points move without importing the wallet internals.
 */
@Module({
  imports: [AuthModule, PlatformCoreModule],
  controllers: [WalletPassController, ApplePassLinkController],
  providers: [AppleWalletService, GoogleWalletService, WalletPassService],
  exports: [WalletPassService],
})
export class WalletPassModule {}
