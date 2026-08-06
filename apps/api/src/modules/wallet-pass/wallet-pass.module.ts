import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformCoreModule } from '../../platform-core/platform-core.module';
import { ApnsService } from './apns.service';
import { AppleWalletService } from './apple-wallet.service';
import { PassKitService } from './passkit.service';
import { PassKitPassController, PassKitWebController } from './passkit-web.controller';
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
  controllers: [WalletPassController, ApplePassLinkController, PassKitWebController, PassKitPassController],
  providers: [AppleWalletService, GoogleWalletService, WalletPassService, ApnsService, PassKitService],
  exports: [WalletPassService, PassKitService],
})
export class WalletPassModule {}
