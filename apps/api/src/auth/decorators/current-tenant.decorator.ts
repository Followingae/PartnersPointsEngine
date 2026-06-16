import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@rfm-loyalty/shared';

/** Injects the verified TenantContext attached by an auth guard. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<{ tenant?: TenantContext }>();
    if (!req.tenant) {
      throw new Error('CurrentTenant used on a route without an auth guard');
    }
    return req.tenant;
  },
);
