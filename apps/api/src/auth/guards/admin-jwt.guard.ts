import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from '../tokens/token.service';
import { claimsToTenant } from '../tokens/token.service';

function bearer(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Verifies an admin access JWT (superadmin or brand-admin surface) and binds tenant context. */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { tenant?: unknown; roles?: string[] }>();
    const token = bearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException('missing bearer token');

    let claims;
    try {
      claims = await this.tokens.verifyAccess(token);
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
    if (claims.surface !== 'superadmin' && claims.surface !== 'brand_admin') {
      throw new UnauthorizedException('token not valid for this surface');
    }
    req.tenant = claimsToTenant(claims);
    req.roles = claims.roles ?? [];
    return true;
  }
}
