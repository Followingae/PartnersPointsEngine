import { AsyncLocalStorage } from 'node:async_hooks';
import type { TenantContext } from '@rfm-loyalty/shared';

/**
 * Request-scoped tenant context, derived ONLY from verified auth claims and
 * propagated via AsyncLocalStorage so any service can read it without prop drilling.
 */
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function currentTenant(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function requireTenant(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error('No tenant context bound to this request');
  }
  return ctx;
}
