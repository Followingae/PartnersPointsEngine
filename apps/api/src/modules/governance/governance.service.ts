import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { OutboxService } from '../workers/outbox.service';
import { AppliersRegistry } from './appliers.registry';

export type GovernanceMode = 'autonomous' | 'approval_required' | 'superadmin_managed';
export type ChangeAction = 'create' | 'update' | 'delete';

export interface SubmitInput {
  entityType: string;
  action: ChangeAction;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  reason?: string;
}

interface ListQuery {
  status?: string;
  entityType?: string;
  brandId?: string;
  limit?: number;
  offset?: number;
}

const SCALAR = (v: unknown) => (v === null || ['string', 'number', 'boolean'].includes(typeof v) ? v : JSON.stringify(v));

/** Shallow field-level diff (payload vs current snapshot) for side-by-side rendering. */
function computeDiff(action: ChangeAction, snapshot: Record<string, unknown> | null, payload: Record<string, unknown>) {
  const diff: Array<{ path: string; old: unknown; new: unknown }> = [];
  if (action === 'delete') {
    for (const [k, v] of Object.entries(snapshot ?? {})) diff.push({ path: k, old: SCALAR(v), new: null });
    return diff;
  }
  for (const [k, v] of Object.entries(payload)) {
    const before = snapshot ? snapshot[k] : undefined;
    if (SCALAR(before) !== SCALAR(v)) diff.push({ path: k, old: before === undefined ? null : SCALAR(before), new: SCALAR(v) });
  }
  return diff;
}

@Injectable()
export class GovernanceService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly appliers: AppliersRegistry,
  ) {}

  /** Effective mode for a brand + capability: per-entity override else brand default. */
  async resolveMode(ctx: TenantContext, entityType: string): Promise<GovernanceMode> {
    return this.tenants.run(ctx, async (tx) => {
      const override = await tx.governanceConfig.findUnique({
        where: { brandId_entityType: { brandId: ctx.brandId!, entityType } },
        select: { mode: true },
      });
      if (override) return override.mode as GovernanceMode;
      const brand = await tx.brand.findFirst({ where: { id: ctx.brandId! }, select: { governanceMode: true } });
      return (brand?.governanceMode ?? 'autonomous') as GovernanceMode;
    });
  }

  /** Create a change-request from a brand actor's proposed mutation. */
  async submit(ctx: TenantContext, input: SubmitInput) {
    if (!this.appliers.has(input.entityType)) throw new BadRequestException(`unknown governed entity: ${input.entityType}`);
    if ((input.action === 'update' || input.action === 'delete') && !input.entityId) {
      throw new BadRequestException(`${input.action} requires an entityId`);
    }
    const applier = this.appliers.get(input.entityType)!;
    const snapshot = input.entityId ? await applier.fetch(ctx, input.entityId) : null;
    if ((input.action === 'update' || input.action === 'delete') && !snapshot) {
      throw new NotFoundException(`${input.entityType} not found`);
    }
    const payload = input.payload ?? {};
    const diff = computeDiff(input.action, snapshot, payload);

    return this.tenants.run(ctx, async (tx) => {
      const cr = await tx.changeRequest.create({
        data: {
          platformId: ctx.platformId,
          groupId: ctx.groupId!,
          brandId: ctx.brandId!,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          action: input.action,
          proposedPayload: payload as Prisma.InputJsonValue,
          currentSnapshot: (snapshot ?? undefined) as Prisma.InputJsonValue,
          diff: diff as unknown as Prisma.InputJsonValue,
          reason: input.reason ?? null,
          requesterId: ctx.actor.id,
        },
        select: { id: true, status: true, entityType: true, action: true },
      });
      await this.audit.record(tx, ctx, { action: 'change_request.submit', targetType: 'change_request', targetId: cr.id, data: { entityType: input.entityType, crAction: input.action } });
      await this.outbox.emit(tx, ctx, 'change_request', 'change_request.created', { changeRequestId: cr.id, entityType: input.entityType, action: input.action });
      return cr;
    });
  }

  // ── brand reads ────────────────────────────────────────────────────────────

  async listForBrand(ctx: TenantContext, query: ListQuery = {}) {
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.ChangeRequestWhereInput = {
        brandId: ctx.brandId!,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.changeRequest.findMany({ where, orderBy: { requestedAt: 'desc' }, take: Math.min(query.limit ?? 50, 200), skip: query.offset ?? 0 }),
        tx.changeRequest.count({ where }),
      ]);
      return { rows, total };
    });
  }

  async getForBrand(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const cr = await tx.changeRequest.findFirst({ where: { id, brandId: ctx.brandId! } });
      if (!cr) throw new NotFoundException('change request not found');
      return cr;
    });
  }

  async withdraw(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const cr = await tx.changeRequest.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true, status: true } });
      if (!cr) throw new NotFoundException('change request not found');
      if (cr.status !== 'pending') throw new BadRequestException(`cannot withdraw a ${cr.status} request`);
      await tx.changeRequest.update({ where: { id }, data: { status: 'withdrawn' } });
      await this.audit.record(tx, ctx, { action: 'change_request.withdraw', targetType: 'change_request', targetId: id });
      return { id, status: 'withdrawn' };
    });
  }

  // ── superadmin reads + decisions ─────────────────────────────────────────────

  async listAll(ctx: TenantContext, query: ListQuery = {}) {
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.ChangeRequestWhereInput = {
        platformId: ctx.platformId,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.brandId ? { brandId: query.brandId } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.changeRequest.findMany({ where, orderBy: { requestedAt: 'asc' }, take: Math.min(query.limit ?? 50, 200), skip: query.offset ?? 0 }),
        tx.changeRequest.count({ where }),
      ]);
      return { rows, total };
    });
  }

  async getOne(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const cr = await tx.changeRequest.findFirst({ where: { id, platformId: ctx.platformId } });
      if (!cr) throw new NotFoundException('change request not found');
      return cr;
    });
  }

  async approve(ctx: TenantContext, id: string) {
    const cr = await this.getOne(ctx, id);
    if (cr.status !== 'pending') throw new BadRequestException(`request is already ${cr.status}`);
    const applier = this.appliers.get(cr.entityType);
    if (!applier) throw new BadRequestException(`unknown governed entity: ${cr.entityType}`);

    // Apply in the brand's context, attributing the change to the superadmin acting on the requester's behalf.
    const brandCtx: TenantContext = {
      platformId: cr.platformId,
      groupId: cr.groupId,
      brandId: cr.brandId,
      branchId: null,
      scopeLevel: 'brand',
      surface: ctx.surface,
      actor: { type: ctx.actor.type, id: ctx.actor.id, onBehalfOf: cr.requesterId },
    };
    const payload = (cr.proposedPayload ?? {}) as Record<string, unknown>;
    let appliedEntityId = cr.entityId ?? null;
    if (cr.action === 'create') {
      const created = await applier.create(brandCtx, payload);
      appliedEntityId = created.id;
    } else if (cr.action === 'update') {
      await applier.update(brandCtx, cr.entityId!, payload);
    } else {
      await applier.remove(brandCtx, cr.entityId!);
    }

    return this.tenants.run(ctx, async (tx) => {
      const updated = await tx.changeRequest.update({
        where: { id },
        data: { status: 'approved', reviewerId: ctx.actor.id, appliedEntityId, reviewedAt: new Date() },
        select: { id: true, status: true, appliedEntityId: true, brandId: true },
      });
      await this.audit.record(tx, ctx, { action: 'change_request.approve', targetType: 'change_request', targetId: id, governanceContextId: id, data: { entityType: cr.entityType, crAction: cr.action } });
      await this.outbox.emit(tx, ctx, 'change_request', 'change_request.approved', { changeRequestId: id, brandId: cr.brandId, entityType: cr.entityType });
      return updated;
    });
  }

  async reject(ctx: TenantContext, id: string, decisionReason?: string) {
    const cr = await this.getOne(ctx, id);
    if (cr.status !== 'pending') throw new BadRequestException(`request is already ${cr.status}`);
    return this.tenants.run(ctx, async (tx) => {
      const updated = await tx.changeRequest.update({
        where: { id },
        data: { status: 'rejected', reviewerId: ctx.actor.id, decisionReason: decisionReason ?? null, reviewedAt: new Date() },
        select: { id: true, status: true },
      });
      await this.audit.record(tx, ctx, { action: 'change_request.reject', targetType: 'change_request', targetId: id, governanceContextId: id, data: { reason: decisionReason } });
      await this.outbox.emit(tx, ctx, 'change_request', 'change_request.rejected', { changeRequestId: id, brandId: cr.brandId });
      return updated;
    });
  }

  async bulkApprove(ctx: TenantContext, ids: string[]) {
    const results = await Promise.allSettled(ids.map((id) => this.approve(ctx, id)));
    return this.summarize(ids, results);
  }

  async bulkReject(ctx: TenantContext, ids: string[], decisionReason?: string) {
    const results = await Promise.allSettled(ids.map((id) => this.reject(ctx, id, decisionReason)));
    return this.summarize(ids, results);
  }

  private summarize(ids: string[], results: PromiseSettledResult<unknown>[]) {
    const errors: Array<{ id: string; error: string }> = [];
    let ok = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') ok += 1;
      else errors.push({ id: ids[i]!, error: r.reason instanceof Error ? r.reason.message : 'failed' });
    });
    return { processed: ok, failed: errors.length, errors };
  }

  async stats(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const grouped = await tx.changeRequest.groupBy({ by: ['status'], where: { platformId: ctx.platformId }, _count: { _all: true } });
      const counts: { pending: number; approved: number; rejected: number; withdrawn: number } = { pending: 0, approved: 0, rejected: 0, withdrawn: 0 };
      for (const g of grouped) counts[g.status] = g._count._all;
      const decided = counts.approved + counts.rejected;
      return { ...counts, approvalRate: decided ? Math.round((counts.approved / decided) * 100) : null };
    });
  }

  // ── governance config (superadmin) ───────────────────────────────────────────

  async getBrandGovernance(ctx: TenantContext, brandId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const brand = await tx.brand.findFirst({ where: { id: brandId, platformId: ctx.platformId }, select: { id: true, name: true, governanceMode: true } });
      if (!brand) throw new NotFoundException('brand not found');
      const overrides = await tx.governanceConfig.findMany({ where: { brandId }, select: { entityType: true, mode: true } });
      return { brandId: brand.id, name: brand.name, defaultMode: brand.governanceMode, overrides, capabilities: this.appliers.entityTypes() };
    });
  }

  async setBrandGovernance(ctx: TenantContext, brandId: string, dto: { defaultMode?: GovernanceMode; overrides?: Array<{ entityType: string; mode: GovernanceMode | 'inherit' }> }) {
    await this.tenants.run(ctx, async (tx) => {
      const brand = await tx.brand.findFirst({ where: { id: brandId, platformId: ctx.platformId }, select: { id: true, groupId: true } });
      if (!brand) throw new NotFoundException('brand not found');
      if (dto.defaultMode) await tx.brand.update({ where: { id: brandId }, data: { governanceMode: dto.defaultMode } });
      for (const o of dto.overrides ?? []) {
        if (o.mode === 'inherit') {
          await tx.governanceConfig.deleteMany({ where: { brandId, entityType: o.entityType } });
        } else {
          await tx.governanceConfig.upsert({
            where: { brandId_entityType: { brandId, entityType: o.entityType } },
            update: { mode: o.mode },
            create: { brandId, groupId: brand.groupId, platformId: ctx.platformId, entityType: o.entityType, mode: o.mode },
          });
        }
      }
      await this.audit.record(tx, ctx, { action: 'governance.config.set', targetType: 'brand', targetId: brandId, data: { defaultMode: dto.defaultMode, overrides: dto.overrides } });
    });
    // Read fresh AFTER the write commits (a nested run would read a stale snapshot).
    return this.getBrandGovernance(ctx, brandId);
  }

  /** Used by the interceptor to block direct edits under superadmin_managed mode. */
  blockedError(entityType: string): never {
    throw new ForbiddenException({
      message: `${entityType} changes are managed by the platform. Submit a change request instead.`,
      details: { kind: 'governance_superadmin_managed', canSubmit: true, entityType },
    });
  }
}
