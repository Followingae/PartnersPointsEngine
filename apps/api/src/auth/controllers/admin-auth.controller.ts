import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { AuthService } from '../auth.service';
import { CurrentTenant } from '../decorators/current-tenant.decorator';
import { ConfirmMfaDto, LoginDto, MfaVerifyDto, RefreshDto } from '../dto/admin-auth.dto';
import { AdminJwtGuard } from '../guards/admin-jwt.guard';

/** In-house admin identity (superadmin + brand admin share one identity store). */
@ApiTags('auth')
@Controller('auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Email + password login; returns tokens or { mfaRequired: true }.' })
  login(@Body() dto: LoginDto) {
    return this.auth.adminLogin(dto.email, dto.password);
  }

  @Post('mfa')
  @HttpCode(200)
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
  @ApiOperation({ summary: 'Begin TOTP enrolment; returns the secret + otpauth URI.' })
  enrol(@CurrentTenant() tenant: TenantContext) {
    return this.auth.enrolMfa(tenant.actor.id);
  }

  @Post('mfa/confirm')
  @HttpCode(200)
  @UseGuards(AdminJwtGuard)
  @ApiOperation({ summary: 'Confirm TOTP enrolment with a code; enables MFA.' })
  confirm(@CurrentTenant() tenant: TenantContext, @Body() dto: ConfirmMfaDto) {
    return this.auth.confirmMfa(tenant.actor.id, dto.code);
  }
}
