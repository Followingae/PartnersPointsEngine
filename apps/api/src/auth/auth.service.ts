import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
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

/** Shape returned by the wallet_person_by_phone definer function. */
interface WalletPerson {
  id: string;
  platformId: string;
  fullName: string | null;
  memberships: Array<{ membershipId: string; brandId: string; brandName: string; status: string }>;
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

  /**
   * Send a sign-in code.
   *
   * The response is deliberately the same whether or not the number belongs to
   * anyone: telling the caller would turn this into a way to test which phone
   * numbers are customers. Rate limiting is the one thing it does report, since
   * the caller needs to know when to try again.
   */
  async requestOtp(phone: string): Promise<{ sent: boolean; retryAfterSeconds?: number }> {
    const r = await this.otp.issue(phone);
    if (!r.sent) throw new HttpException(
      { message: `Too many codes requested. Try again in ${Math.ceil((r.retryAfterSeconds ?? 60) / 60)} minutes.` },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    return { sent: true };
  }

  /**
   * Sign in to the wallet, which spans every brand the person belongs to.
   *
   * The per-brand `verifyOtp` below can't serve the customer app: it needs a
   * brand up front, and the app doesn't know one until it has seen the cards.
   * The person is read through a definer function because sign-in happens
   * before any tenant context exists.
   */
  async verifyOtpForWallet(phone: string, code: string): Promise<TokenPair & { personId: string }> {
    if (!(await this.otp.verify(phone, code))) throw new UnauthorizedException('invalid or expired code');
    const rows = await this.db.$queryRaw<{ person: WalletPerson | null }[]>`
      SELECT wallet_person_by_phone(${sha256(phone)}) AS person`;
    const person = rows[0]?.person ?? null;
    if (!person) throw new UnauthorizedException('not a member');

    const claims: AccessClaims = {
      sub: person.id,
      surface: 'customer',
      platformId: person.platformId,
      // A wallet has no single brand; everything behind it reads through the
      // wallet_* definer functions rather than RLS.
      scopeLevel: 'platform',
      groupId: null,
      brandId: null,
      branchId: null,
      actorType: 'customer',
      wallet: true,
    };
    const accessToken = await this.tokens.issueAccess(claims);
    const refreshToken = await this.tokens.issueRefresh({ sub: person.id, surface: 'customer' });
    await this.storeRefresh(refreshToken, person.id, person.platformId);
    return { accessToken, refreshToken, expiresIn: this.accessTtl(), personId: person.id };
  }

  /**
   * Exchange a wallet session for a brand-scoped customer token, so the
   * existing per-brand endpoints (rewards, redemption, partners) can serve a
   * card's detail screens. Membership is re-checked here rather than trusted
   * from the wallet token.
   */
  async brandTokenForWallet(personId: string, brandId: string): Promise<TokenPair> {
    const membership = await this.db.customerMembership.findUnique({
      where: { personId_brandId: { personId, brandId } },
    });
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedException('not a member of this brand');
    }
    const claims: AccessClaims = {
      sub: personId,
      surface: 'customer',
      platformId: membership.platformId,
      scopeLevel: 'brand',
      groupId: membership.groupId,
      brandId: membership.brandId,
      branchId: null,
      actorType: 'customer',
    };
    const accessToken = await this.tokens.issueAccess(claims);
    const refreshToken = await this.tokens.issueRefresh({ sub: personId, surface: 'customer' });
    await this.storeRefresh(refreshToken, personId, membership.platformId);
    return { accessToken, refreshToken, expiresIn: this.accessTtl() };
  }

  async verifyOtp(phone: string, code: string, brandId: string): Promise<TokenPair> {
    if (!(await this.otp.verify(phone, code))) throw new UnauthorizedException('invalid or expired code');
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
