import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';

/**
 * Ledger module — the double-entry points + wallet engine (Phase 2).
 * Owns journal/entry/balance/idempotency; other modules call it through
 * {@link LedgerService}, never its tables.
 */
@Module({
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
