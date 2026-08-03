import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { LoyaltyRulesModule } from '../loyalty-rules/loyalty-rules.module';
import { WorkersModule } from '../workers/workers.module';
import { ReceiptPublicController } from './receipt-public.controller';
import { TerminalController } from './terminal.controller';
import { TerminalService } from './terminal.service';

/**
 * Terminal-gateway module — the narrow, versioned /v1/terminal/* surface for the
 * first-party POS fleet: HMAC auth, member tokens, idempotency, offline replay,
 * and the authorize→capture/void transaction state machine (Phase 4).
 */
@Module({
  imports: [AuthModule, LoyaltyRulesModule, WorkersModule],
  controllers: [TerminalController, ReceiptPublicController],
  providers: [TerminalService],
  exports: [TerminalService],
})
export class TerminalGatewayModule {}
