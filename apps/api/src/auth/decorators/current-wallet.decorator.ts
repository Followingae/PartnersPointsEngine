import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { WalletPrincipal } from '../guards/wallet-jwt.guard';

/** The person behind the wallet session, set by WalletJwtGuard. */
export const CurrentWallet = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WalletPrincipal => {
    const req = ctx.switchToHttp().getRequest<{ wallet?: WalletPrincipal }>();
    if (!req.wallet) throw new Error('CurrentWallet used without WalletJwtGuard');
    return req.wallet;
  },
);
