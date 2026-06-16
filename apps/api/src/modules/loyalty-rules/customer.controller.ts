import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { CustomerJwtGuard } from '../../auth/guards/customer-jwt.guard';
import { GamificationService } from './gamification.service';
import { RedeemDto, RedeemReferralDto } from './dto';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';

/** Customer surface — the consumer's own brand membership (closed-loop). */
@ApiTags('customer')
@ApiBearerAuth('customer')
@Controller('customer')
@UseGuards(CustomerJwtGuard)
export class CustomerController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly gamification: GamificationService,
    private readonly referrals: ReferralService,
  ) {}

  @Get('balance')
  @ApiOperation({ summary: 'Points balance, lifetime, and current tier.' })
  async balance(@CurrentTenant() ctx: TenantContext) {
    const membershipId = await this.loyalty.resolveCustomerMembership(ctx);
    return this.loyalty.balance(ctx, membershipId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Recent points transaction history.' })
  async transactions(@CurrentTenant() ctx: TenantContext) {
    const membershipId = await this.loyalty.resolveCustomerMembership(ctx);
    return this.loyalty.history(ctx, membershipId);
  }

  @Get('rewards')
  @ApiOperation({ summary: 'Reward catalog for this brand.' })
  rewards(@CurrentTenant() ctx: TenantContext) {
    return this.loyalty.catalog(ctx);
  }

  @Post('rewards/:id/redeem')
  @ApiOperation({ summary: 'Redeem points for a reward; issues a voucher.' })
  async redeem(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: RedeemDto) {
    const membershipId = await this.loyalty.resolveCustomerMembership(ctx);
    return this.loyalty.redeem(ctx, membershipId, id, dto.idempotencyKey);
  }

  @Post('vouchers/:code/redeem')
  @ApiOperation({ summary: 'Redeem (use) an issued voucher.' })
  async redeemVoucher(@CurrentTenant() ctx: TenantContext, @Param('code') code: string) {
    const membershipId = await this.loyalty.resolveCustomerMembership(ctx);
    return this.loyalty.redeemVoucher(ctx, code, membershipId);
  }

  @Get('badges')
  @ApiOperation({ summary: 'Badges earned by the member.' })
  async badges(@CurrentTenant() ctx: TenantContext) {
    const membershipId = await this.loyalty.resolveCustomerMembership(ctx);
    return this.gamification.badges(ctx, membershipId);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Top members in this brand by lifetime points.' })
  leaderboard(@CurrentTenant() ctx: TenantContext) {
    return this.gamification.leaderboard(ctx);
  }

  @Get('referral-code')
  @ApiOperation({ summary: "Get (or create) the member's referral code." })
  async referralCode(@CurrentTenant() ctx: TenantContext) {
    const membershipId = await this.loyalty.resolveCustomerMembership(ctx);
    return this.referrals.getOrCreateCode(ctx, membershipId);
  }

  @Post('referral/redeem')
  @ApiOperation({ summary: 'Redeem a referral code; rewards both parties.' })
  async redeemReferral(@CurrentTenant() ctx: TenantContext, @Body() dto: RedeemReferralDto) {
    const membershipId = await this.loyalty.resolveCustomerMembership(ctx);
    return this.referrals.redeem(ctx, dto.code, membershipId);
  }
}
