import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { TenantContext } from '@rfm-loyalty/shared';
import { tenantStorage } from './tenant-context';

/**
 * Binds the request's TenantContext (set by an auth guard) into AsyncLocalStorage
 * for the duration of the handler, so logging and any service can read it.
 */
@Injectable()
export class TenantAlsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ tenant?: TenantContext }>();
    const tenant = req.tenant;
    if (!tenant) return next.handle();
    return new Observable((subscriber) => {
      tenantStorage.run(tenant, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
