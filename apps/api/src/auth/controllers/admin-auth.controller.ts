import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { TenantContext } from '@rfm-loyalty/shared';
import { AuthService } from '../auth.service';
import { CurrentTenant } from '../decorators/current-tenant.decorator';
import { ChangePasswordDto, ConfirmMfaDto, EnrolMfaDto, LoginDto, MfaVerifyDto, RefreshDto } from '../dto/admin-auth.dto';
import { AdminJwtGuard } from '../guards/admin-jwt.guard';

/** In-house admin identity (superadmin + brand admin share one identity store). */
@ApiTags('auth')
@Controller('auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * The console's front door. Ten attempts a minute leaves a forgetful admin
   * unbothered and makes a password list impractical.
   */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Email + password login; returns tokens or { mfaRequired: true }.' })
  login(@Body() dto: LoginDto) {
    return this.auth.adminLogin(dto.email, dto.password);
  }

  @Post('mfa')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Verify TOTP after a login that returned mfaRequired.' })
  mfa(@Body() dto: MfaVerifyDto) {
    return this.auth.adminMfa(dto.email, dto.password, dto.code);
  }

  @Post('token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token for a new access+refresh pair.' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Post('mfa/enrol')
  @UseGuards(AdminJwtGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Begin TOTP enrolment (re-authenticates with the current password).' })
  enrol(@CurrentTenant() tenant: TenantContext, @Body() dto: EnrolMfaDto) {
    return this.auth.enrolMfaReauth(tenant.actor.id, dto.password);
  }

  @Post('mfa/confirm')
  @HttpCode(200)
  @UseGuards(AdminJwtGuard)
  @ApiOperation({ summary: 'Confirm TOTP enrolment with a code; enables MFA.' })
  confirm(@CurrentTenant() tenant: TenantContext, @Body() dto: ConfirmMfaDto) {
    return this.auth.confirmMfa(tenant.actor.id, dto.code);
  }

  @Post('password')
  @HttpCode(200)
  @UseGuards(AdminJwtGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Change the signed-in admin password; revokes existing sessions.' })
  changePassword(@CurrentTenant() tenant: TenantContext, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(tenant.actor.id, dto.currentPassword, dto.newPassword);
  }
}
