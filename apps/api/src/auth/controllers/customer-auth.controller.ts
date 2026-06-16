import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth.service';
import { OtpRequestDto, OtpVerifyDto } from '../dto/customer-auth.dto';

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
}
