import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ApiSurface, ScopeLevel, TenantContext } from '@rfm-loyalty/shared';

/** Claims carried in access/refresh JWTs. Scope is set at login from verified data. */
export interface AccessClaims {
  sub: string; // user_id (admin) / person_id (customer)
  surface: ApiSurface;
  platformId: string;
  scopeLevel: ScopeLevel;
  groupId?: string | null;
  brandId?: string | null;
  branchId?: string | null;
  roles?: string[];
  actorType: 'user' | 'customer' | 'terminal' | 'system';
  /** Superadmin acting as a brand (full override of governance locks). */
  elevated?: boolean;
  /** The platform user a brand-scoped impersonation token was minted for. */
  onBehalfOf?: string | null;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  issueAccess(claims: AccessClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900,
    });
  }

  issueRefresh(payload: { sub: string; surface: ApiSurface }): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 2_592_000,
    });
  }

  verifyAccess(token: string): Promise<AccessClaims> {
    return this.jwt.verifyAsync<AccessClaims>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  verifyRefresh(token: string): Promise<{ sub: string; surface: ApiSurface }> {
    return this.jwt.verifyAsync(token, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }

  /** Short-lived opaque token a terminal uses to reference a resolved member. */
  issueMemberToken(payload: MemberTokenClaims): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: 600, // 10 minutes
    });
  }

  verifyMemberToken(token: string): Promise<MemberTokenClaims> {
    return this.jwt.verifyAsync<MemberTokenClaims>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }
}

export interface MemberTokenClaims {
  membershipId: string;
  brandId: string;
  groupId: string;
  platformId: string;
}

/** Reconstruct the request tenant context from verified token claims. */
export function claimsToTenant(claims: AccessClaims): TenantContext {
  return {
    platformId: claims.platformId,
    groupId: claims.groupId ?? null,
    brandId: claims.brandId ?? null,
    branchId: claims.branchId ?? null,
    scopeLevel: claims.scopeLevel,
    surface: claims.surface,
    elevated: claims.elevated ?? false,
    actor: { type: claims.actorType, id: claims.sub, onBehalfOf: claims.onBehalfOf ?? null },
  };
}
