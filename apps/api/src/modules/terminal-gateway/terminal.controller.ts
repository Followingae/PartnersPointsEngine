import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { TerminalHmacGuard } from '../../auth/guards/terminal-hmac.guard';
import { BatchDto, CreateReceiptDto, EnrollDto, MemberContextDto, QuoteDto, RedeemVoucherDto, ResolveDto, TransactionDto } from './dto';
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

  @Get('config')
  @ApiOperation({ summary: 'Terminal boot config: brand identity + redemption valuation.' })
  config(@CurrentTenant() ctx: TenantContext) {
    return this.terminal.config(ctx);
  }

  @Post('members/resolve')
  @ApiOperation({ summary: 'Resolve a customer identifier to an opaque member token.' })
  resolve(@CurrentTenant() ctx: TenantContext, @Body() dto: ResolveDto) {
    return this.terminal.resolve(ctx, dto.type, dto.value);
  }

  @Post('members/enroll')
  @ApiOperation({ summary: 'At-till enrollment by phone; profile completes later in the customer app.' })
  enroll(@CurrentTenant() ctx: TenantContext, @Body() dto: EnrollDto) {
    return this.terminal.enroll(ctx, dto);
  }

  @Post('receipts')
  @ApiOperation({ summary: 'Persist an eReceipt for the printed QR (idempotent by token).' })
  createReceipt(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateReceiptDto) {
    return this.terminal.createReceipt(ctx, dto);
  }

  @Post('members/vouchers')
  @ApiOperation({ summary: 'Rewards this member can use right now — shown to the cashier.' })
  memberVouchers(@CurrentTenant() ctx: TenantContext, @Body() dto: MemberContextDto) {
    return this.terminal.memberVouchers(ctx, dto.memberToken);
  }

  @Post('vouchers/redeem')
  @ApiOperation({ summary: 'Redeem a reward voucher at the till (code from the app or a slip).' })
  redeemVoucher(@CurrentTenant() ctx: TenantContext, @Body() dto: RedeemVoucherDto) {
    return this.terminal.redeemVoucher(ctx, dto.code, dto.memberToken);
  }

  @Post('members/context')
  @ApiOperation({ summary: 'Member snapshot for the cashier screen (name, tier, balance).' })
  memberContext(@CurrentTenant() ctx: TenantContext, @Body() dto: MemberContextDto) {
    return this.terminal.memberContext(ctx, dto.memberToken);
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
