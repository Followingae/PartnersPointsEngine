import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from '../tokens/token.service';
import { claimsToTenant } from '../tokens/token.service';

/** Verifies a customer access JWT and binds tenant context (brand-scoped). */
@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { tenant?: unknown }>();
    const header = req.headers.authorization;
    const token =
      typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
        ? header.slice(7)
        : null;
    if (!token) throw new UnauthorizedException('missing bearer token');

    let claims;
    try {
      claims = await this.tokens.verifyAccess(token);
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
    if (claims.surface !== 'customer') {
      throw new UnauthorizedException('token not valid for this surface');
    }
    req.tenant = claimsToTenant(claims);
    return true;
  }
}
