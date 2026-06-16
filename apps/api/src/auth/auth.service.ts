import { createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiSurface, ScopeLevel } from '@rfm-loyalty/shared';
import { AuthPrismaService } from './auth-prisma.service';
import { EnvelopeCryptoService } from './crypto/envelope-crypto.service';
import { PasswordService } from './crypto/password.service';
import { OtpStoreService } from './otp/otp-store.service';
import { TotpService } from './totp/totp.service';
import { TokenService } from './tokens/token.service';
import { type AccessClaims } from './tokens/token.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const SCOPE_PRECEDENCE: Record<ScopeLevel, number> = {
  platform: 0,
  group: 1,
  brand: 2,
  branch: 3,
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: AuthPrismaService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly tokens: TokenService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly otp: OtpStoreService,
    private readonly config: ConfigService,
  ) {}

  // ── Admin (superadmin + brand admin) ────────────────────────────────────────

  async adminLogin(email: string, password: string): Promise<{ mfaRequired: true } | TokenPair> {
    const user = await this.findActiveAdmin(email);
    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('invalid credentials');
    if (user.totpEnabled) return { mfaRequired: true };
    return this.issueAdminTokens(user.id);
  }

  async adminMfa(email: string, password: string, code: string): Promise<TokenPair> {
    const user = await this.findActiveAdmin(email);
    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('invalid credentials');
    if (!user.totpEnabled || !user.totpSecretEnc) throw new UnauthorizedException('MFA not enrolled');
    const secret = this.crypto.decrypt(Buffer.from(user.totpSecretEnc));
    if (!this.totp.verify(code, secret)) throw new UnauthorizedException('invalid MFA code');
    return this.issueAdminTokens(user.id);
  }

  async enrolMfa(userId: string): Promise<{ secret: string; keyUri: string }> {
    const user = await this.db.userAccount.findUniqueOrThrow({ where: { id: userId } });
    const secret = this.totp.generateSecret();
    await this.db.userAccount.update({
      where: { id: userId },
      data: { totpSecretEnc: this.crypto.encrypt(secret), totpEnabled: false },
    });
    return { secret, keyUri: this.totp.keyUri(user.email, secret) };
  }

  async confirmMfa(userId: string, code: string): Promise<{ enabled: boolean }> {
    const user = await this.db.userAccount.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecretEnc) throw new UnauthorizedException('start enrolment first');
    const secret = this.crypto.decrypt(Buffer.from(user.totpSecretEnc));
    if (!this.totp.verify(code, secret)) throw new UnauthorizedException('invalid MFA code');
    await this.db.userAccount.update({ where: { id: userId }, data: { totpEnabled: true } });
    return { enabled: true };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; surface: ApiSurface };
    try {
      payload = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    const tokenHash = sha256(refreshToken);
    const stored = await this.db.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('refresh token not active');
    }
    await this.db.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } });
    return this.issueAdminTokens(payload.sub, tokenHash);
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    const tokenHash = sha256(refreshToken);
    await this.db.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
    return { ok: true };
  }

  // ── Customer (phone OTP) ────────────────────────────────────────────────────

  requestOtp(phone: string): { sent: true } {
    this.otp.issue(phone);
    return { sent: true };
  }

  async verifyOtp(phone: string, code: string, brandId: string): Promise<TokenPair> {
    if (!this.otp.verify(phone, code)) throw new UnauthorizedException('invalid or expired code');
    const phoneHash = sha256(phone);
    const person = await this.db.person.findUnique({ where: { phoneHash } });
    if (!person) throw new UnauthorizedException('not a member');
    const membership = await this.db.customerMembership.findUnique({
      where: { personId_brandId: { personId: person.id, brandId } },
    });
    if (!membership || membership.status !== 'active') throw new UnauthorizedException('not a member of this brand');

    const claims: AccessClaims = {
      sub: person.id,
      surface: 'customer',
      platformId: membership.platformId,
      scopeLevel: 'brand',
      groupId: membership.groupId,
      brandId: membership.brandId,
      branchId: null,
      actorType: 'customer',
    };
    const accessToken = await this.tokens.issueAccess(claims);
    const refreshToken = await this.tokens.issueRefresh({ sub: person.id, surface: 'customer' });
    await this.storeRefresh(refreshToken, person.id, membership.platformId);
    return { accessToken, refreshToken, expiresIn: this.accessTtl() };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async findActiveAdmin(email: string) {
    const user = await this.db.userAccount.findFirst({ where: { emailLower: email.toLowerCase() } });
    if (!user || user.status !== 'active') throw new UnauthorizedException('invalid credentials');
    return user;
  }

  private accessTtl(): number {
    return this.config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;
  }

  private async issueAdminTokens(userId: string, replacesHash?: string): Promise<TokenPair> {
    const assignments = await this.db.roleAssignment.findMany({
      where: { userId },
      include: { role: true },
    });
    if (assignments.length === 0) throw new UnauthorizedException('user has no role assignments');

    const primary = [...assignments].sort(
      (a, b) => SCOPE_PRECEDENCE[a.scopeLevel] - SCOPE_PRECEDENCE[b.scopeLevel],
    )[0]!;

    const surface: ApiSurface = primary.scopeLevel === 'platform' ? 'superadmin' : 'brand_admin';
    const claims: AccessClaims = {
      sub: userId,
      surface,
      platformId: primary.platformId,
      scopeLevel: primary.scopeLevel,
      groupId: primary.groupId,
      brandId: primary.brandId,
      branchId: primary.branchId,
      roles: assignments.map((a) => a.role.key),
      actorType: 'user',
    };

    const accessToken = await this.tokens.issueAccess(claims);
    const refreshToken = await this.tokens.issueRefresh({ sub: userId, surface });
    const newHash = await this.storeRefresh(refreshToken, userId, primary.platformId);
    if (replacesHash) {
      await this.db.refreshToken
        .update({ where: { tokenHash: replacesHash }, data: { replacedBy: newHash } })
        .catch(() => undefined);
    }
    await this.db.userAccount.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return { accessToken, refreshToken, expiresIn: this.accessTtl() };
  }

  private async storeRefresh(refreshToken: string, userId: string, platformId: string): Promise<string> {
    const tokenHash = sha256(refreshToken);
    const ttl = this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 2_592_000;
    await this.db.refreshToken.create({
      data: {
        userId,
        platformId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return tokenHash;
  }
}
