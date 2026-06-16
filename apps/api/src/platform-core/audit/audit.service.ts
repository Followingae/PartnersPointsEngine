import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';

export interface AuditEntry {
  /** Dotted action verb, e.g. `reward.update`, `group.suspend`. */
  action: string;
  targetType?: string;
  targetId?: string;
  /** Small JSON detail (before/after, reason) — never PII. */
  data?: Record<string, unknown>;
  /** Links this row to the change-request whose approval produced it. */
  governanceContextId?: string;
}

/**
 * Tamper-evident audit trail. Each row hash-chains to the previous one visible in
 * the caller's tenant scope (RLS narrows the chain to the brand/group/platform).
 * The `audit_log` table is append-only (a DB trigger blocks UPDATE/DELETE), so the
 * chain cannot be silently rewritten. Always called inside a TenantService.run tx
 * so the write commits atomically with the mutation it records.
 */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, ctx: TenantContext, entry: AuditEntry): Promise<void> {
    const prev = await tx.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { hash: true } });
    const prevHash = prev?.hash ?? null;

    const body = {
      actorType: ctx.actor.type,
      actorId: ctx.actor.onBehalfOf ?? ctx.actor.id,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      platformId: ctx.platformId,
      groupId: ctx.groupId ?? null,
      brandId: ctx.brandId ?? null,
      branchId: ctx.branchId ?? null,
      governanceContextId: entry.governanceContextId ?? null,
      data: (entry.data ?? {}) as Prisma.InputJsonValue,
    };

    const hash = createHash('sha256')
      .update(`${prevHash ?? ''}|${ctx.actor.id}|${JSON.stringify(body)}`)
      .digest('hex');

    await tx.auditLog.create({ data: { ...body, prevHash, hash } });
  }
}
