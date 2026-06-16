import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthPrismaService } from './auth-prisma.service';
import { AuthService } from './auth.service';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { CustomerAuthController } from './controllers/customer-auth.controller';
import {
  AdminDiagnosticsController,
  CustomerDiagnosticsController,
  TerminalDiagnosticsController,
} from './controllers/diagnostics.controller';
import { EnvelopeCryptoService } from './crypto/envelope-crypto.service';
import { HmacService } from './crypto/hmac.service';
import { NonceStoreService } from './nonce-store.service';
import { PasswordService } from './crypto/password.service';
import { OtpStoreService } from './otp/otp-store.service';
import { TotpService } from './totp/totp.service';
import { TokenService } from './tokens/token.service';
import { AuthzService } from './authz/authz.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { TerminalHmacGuard } from './guards/terminal-hmac.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    AdminAuthController,
    CustomerAuthController,
    AdminDiagnosticsController,
    CustomerDiagnosticsController,
    TerminalDiagnosticsController,
  ],
  providers: [
    AuthPrismaService,
    AuthService,
    PasswordService,
    TotpService,
    HmacService,
    EnvelopeCryptoService,
    OtpStoreService,
    TokenService,
    AuthzService,
    NonceStoreService,
    AdminJwtGuard,
    CustomerJwtGuard,
    TerminalHmacGuard,
  ],
  exports: [
    TokenService,
    AdminJwtGuard,
    CustomerJwtGuard,
    TerminalHmacGuard,
    AuthzService,
    PasswordService,
    // Exported so guards instantiated in consuming modules can resolve their deps.
    AuthPrismaService,
    HmacService,
    EnvelopeCryptoService,
    NonceStoreService,
  ],
})
export class AuthModule {}
