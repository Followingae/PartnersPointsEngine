import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { deviceOf } from '../device';
import { OtpRequestDto, OtpVerifyDto, WalletOtpVerifyDto, WalletRefreshDto } from '../dto/customer-auth.dto';

/** Customer auth: phone OTP → JWT (per-brand, closed-loop). */
@ApiTags('auth')
@Controller('customer/auth')
export class CustomerAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a one-time code for a phone (dev: logged, not sent).' })
  request(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify the code and issue customer tokens for the brand.' })
  verify(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.brandId);
  }

  /**
   * Wallet sign-in for the customer app. No brand is supplied because the app
   * doesn't know one yet — the cards are what reveal which brands the person
   * belongs to.
   */
  @Post('wallet')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify the code and open a wallet session spanning the person’s brands.' })
  wallet(@Body() dto: WalletOtpVerifyDto, @Req() req: Request) {
    return this.auth.verifyOtpForWallet(dto.phone, dto.code, deviceOf(req));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renew a wallet session so the app doesn’t sign the customer out hourly.' })
  refresh(@Body() dto: WalletRefreshDto, @Req() req: Request) {
    return this.auth.refreshWallet(dto.refreshToken, deviceOf(req));
  }
}
