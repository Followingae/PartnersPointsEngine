import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { TerminalHmacGuard } from '../../auth/guards/terminal-hmac.guard';
import { BatchDto, QuoteDto, ResolveDto, TransactionDto } from './dto';
import { TerminalService } from './terminal.service';

/**
 * Terminal/POS gateway — narrow, versioned, HMAC-signed surface for the first-party
 * fleet. authorize → capture/void state machine + offline store-and-forward replay.
 */
@ApiTags('terminal')
@ApiSecurity('terminal-hmac')
@Controller('terminal')
@UseGuards(TerminalHmacGuard)
export class TerminalController {
  constructor(private readonly terminal: TerminalService) {}

  @Post('members/resolve')
  @ApiOperation({ summary: 'Resolve a customer identifier to an opaque member token.' })
  resolve(@CurrentTenant() ctx: TenantContext, @Body() dto: ResolveDto) {
    return this.terminal.resolve(ctx, dto.type, dto.value);
  }

  @Post('quotes')
  @ApiOperation({ summary: 'Preview earn/redeem for a cart (no ledger mutation).' })
  quote(@CurrentTenant() ctx: TenantContext, @Body() dto: QuoteDto) {
    return this.terminal.quote(ctx, dto);
  }

  @Post('transactions')
  @ApiOperation({ summary: 'Earn (single-step) or redeem-authorize. Idempotent.' })
  transaction(@CurrentTenant() ctx: TenantContext, @Body() dto: TransactionDto) {
    return this.terminal.transaction(ctx, dto);
  }

  @Post('transactions/:id/capture')
  @ApiOperation({ summary: 'Capture an authorized redeem.' })
  capture(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.terminal.capture(ctx, id);
  }

  @Post('transactions/:id/void')
  @ApiOperation({ summary: 'Void (release) an authorized redeem hold.' })
  voidTxn(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.terminal.voidTxn(ctx, id);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Poll a transaction for its definitive state.' })
  get(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.terminal.get(ctx, id);
  }

  @Post('transactions/batch')
  @ApiOperation({ summary: 'Replay a batch of queued offline operations (deduped).' })
  batch(@CurrentTenant() ctx: TenantContext, @Body() dto: BatchDto) {
    return this.terminal.batch(ctx, dto.operations);
  }
}
