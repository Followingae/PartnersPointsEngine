import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthzService } from './authz.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

/** Enforces @RequirePermissions(...) using the principal's roles (set by the auth guard). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { roles?: string[] }>();
    const roles = req.roles ?? [];
    const ok = required.every((p) => this.authz.hasPermission(roles, p));
    if (!ok) throw new ForbiddenException('insufficient permissions');
    return true;
  }
}
