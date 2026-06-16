import { z } from 'zod';
import { ApiSurface, ScopeLevel } from './enums';

/**
 * The verified tenant context for a request. Derived ONLY from authenticated
 * claims (never client headers). Propagated to Postgres via `SET LOCAL app.current_*`
 * inside the request transaction, and used by the app-layer scoping guard.
 *
 * - Loyalty data is isolated by `brandId` (closed-loop per brand).
 * - Wallet/credit data is isolated by `groupId`.
 */
export const TenantContext = z.object({
  platformId: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  brandId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  /** The narrowest level this principal is scoped to. */
  scopeLevel: ScopeLevel,
  surface: ApiSurface,
  actor: z.object({
    type: z.enum(['user', 'customer', 'terminal', 'system']),
    id: z.string().uuid(),
    /** Present for impersonation/support sessions (audited). */
    onBehalfOf: z.string().uuid().nullable().optional(),
  }),
});
export type TenantContext = z.infer<typeof TenantContext>;

/** A node in the tenant tree a role assignment can be bound to. */
export const ScopeNode = z.object({
  level: ScopeLevel,
  id: z.string().uuid(),
});
export type ScopeNode = z.infer<typeof ScopeNode>;

/** Postgres GUC names used for RLS context (kept in one place to avoid typos). */
export const RLS_SETTINGS = {
  platform: 'app.current_platform_id',
  group: 'app.current_group_id',
  brand: 'app.current_brand_id',
  branch: 'app.current_branch_id',
  actor: 'app.current_actor_id',
  surface: 'app.current_surface',
} as const;
