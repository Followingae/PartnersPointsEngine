import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from '../tokens/token.service';

/** The person behind a wallet session. No brand — a wallet spans them. */
export interface WalletPrincipal {
  personId: string;
  platformId: string;
}

/**
 * Verifies a customer's person-level wallet session.
 *
 * Deliberately does NOT bind tenant context: a wallet has no single brand, so
 * there is nothing to scope RLS to. Everything behind this guard reads through
 * the wallet_* SECURITY DEFINER functions, which take the person id and are
 * incapable of returning another person's rows.
 */
@Injectable()
export class WalletJwtGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { wallet?: WalletPrincipal }>();
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
    if (claims.surface !== 'customer' || claims.actorType !== 'customer') {
      throw new UnauthorizedException('token not valid for this surface');
    }
    // Brand-scoped customer tokens are not wallet sessions. Requiring the flag
    // keeps the two kinds from being used interchangeably in either direction.
    if (!claims.wallet) {
      throw new UnauthorizedException('not a wallet session');
    }

    req.wallet = { personId: claims.sub, platformId: claims.platformId };
    return true;
  }
}
