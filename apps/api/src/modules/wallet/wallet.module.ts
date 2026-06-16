import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';

/** Wallet module — group prepaid credit, top-ups, and hybrid drawdown (Phase 2). */
@Module({
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
