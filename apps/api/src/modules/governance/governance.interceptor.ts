import { type CallHandler, ConflictException, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { TenantContext } from '@rfm-loyalty/shared';
import { GOVERNED_KEY } from './governed.decorator';
import { GovernanceService, type ChangeAction } from './governance.service';

const METHOD_ACTION: Record<string, ChangeAction | undefined> = { POST: 'create', PATCH: 'update', PUT: 'update', DELETE: 'delete' };

/**
 * Maker-checker enforcement. On a @Governed brand mutation:
 *  - autonomous        → pass through (normal write)
 *  - approval_required → do NOT mutate; enqueue a change-request, return 409 { changeRequestId }
 *  - superadmin_managed → block direct edit with 403 { canSubmit: true }
 * Superadmin / non-brand actors are never gated here.
 */
@Injectable()
export class GovernanceInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly governance: GovernanceService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const entityType = this.reflector.get<string | undefined>(GOVERNED_KEY, context.getHandler());
    if (!entityType) return next.handle();

    const req = context.switchToHttp().getRequest<{ tenant?: TenantContext; method: string; params: Record<string, string>; body: Record<string, unknown> }>();
    const ctx = req.tenant;
    // Governance applies to brand principals only; platform/superadmin writes pass through.
    if (!ctx || ctx.scopeLevel !== 'brand' || !ctx.brandId) return next.handle();
    // A superadmin acting as the brand (elevated) has full override — the write
    // applies directly and is captured by the normal audit trail.
    if (ctx.elevated) return next.handle();

    const action = METHOD_ACTION[req.method];
    if (!action) return next.handle();

    const mode = await this.governance.resolveMode(ctx, entityType);
    if (mode === 'autonomous') return next.handle();

    if (mode === 'superadmin_managed') this.governance.blockedError(entityType);

    // approval_required → enqueue instead of mutating.
    const cr = await this.governance.submit(ctx, {
      entityType,
      action,
      entityId: req.params?.id ?? null,
      payload: req.body ?? {},
    });
    throw new ConflictException({
      message: 'Submitted for approval — a platform admin will review this change.',
      details: { kind: 'change_request_pending', changeRequestId: cr.id, status: 'pending' },
    });
  }
}
