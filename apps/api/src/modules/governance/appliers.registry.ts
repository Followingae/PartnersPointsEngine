import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@rfm-loyalty/shared';

/**
 * Uniform CRUD surface for a governed entity type, so the governance engine can
 * snapshot current state, compute diffs, and APPLY an approved change-request
 * without knowing the entity. Domain modules register their appliers at startup.
 */
export interface EntityApplier {
  /** Current entity as a plain object (for snapshot + diff), or null if absent. */
  fetch(ctx: TenantContext, id: string): Promise<Record<string, unknown> | null>;
  create(ctx: TenantContext, payload: Record<string, unknown>): Promise<{ id: string }>;
  update(ctx: TenantContext, id: string, payload: Record<string, unknown>): Promise<unknown>;
  remove(ctx: TenantContext, id: string): Promise<unknown>;
}

@Injectable()
export class AppliersRegistry {
  private readonly map = new Map<string, EntityApplier>();

  register(entityType: string, applier: EntityApplier): void {
    this.map.set(entityType, applier);
  }

  get(entityType: string): EntityApplier | undefined {
    return this.map.get(entityType);
  }

  has(entityType: string): boolean {
    return this.map.has(entityType);
  }

  /** Entity types that participate in governance (for the per-capability editor). */
  entityTypes(): string[] {
    return [...this.map.keys()];
  }
}
