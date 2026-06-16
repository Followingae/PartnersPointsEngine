import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@rfm-loyalty/shared';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const token = (prefix: string) => `${prefix}_${randomBytes(24).toString('base64url')}`;

/**
 * Brand integration API keys (server-to-server). Reuses the ApiKey model
 * (terminalId null = integration key). Secrets are hashed + envelope-encrypted;
 * the plaintext is shown exactly once at create/rotate.
 */
@Injectable()
export class ApiKeyService {
  constructor(
    private readonly tenants: TenantService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext) {
    return this.tenants.run(ctx, (tx) =>
      tx.apiKey
        .findMany({ where: { brandId: ctx.brandId!, terminalId: null }, orderBy: { createdAt: 'desc' }, select: { id: true, publishableId: true, status: true, rotatedAt: true, createdAt: true } })
        .then((rows) => rows),
    );
  }

  async create(ctx: TenantContext) {
    const publishableId = token('pk');
    const secret = token('sk');
    return this.tenants.run(ctx, async (tx) => {
      const key = await tx.apiKey.create({
        data: {
          publishableId,
          secretHash: sha256(secret),
          secretEnc: this.crypto.encrypt(secret),
          platformId: ctx.platformId,
          groupId: ctx.groupId!,
          brandId: ctx.brandId!,
        },
        select: { id: true, publishableId: true, status: true, createdAt: true },
      });
      await this.audit.record(tx, ctx, { action: 'api_key.create', targetType: 'api_key', targetId: key.id });
      return { ...key, secret }; // shown once
    });
  }

  async rotate(ctx: TenantContext, id: string) {
    const secret = token('sk');
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.apiKey.findFirst({ where: { id, brandId: ctx.brandId!, terminalId: null }, select: { id: true, secretHash: true } });
      if (!existing) throw new NotFoundException('api key not found');
      await tx.apiKey.update({ where: { id }, data: { secretHash: sha256(secret), secretEnc: this.crypto.encrypt(secret), prevSecretHash: existing.secretHash, rotatedAt: new Date(), status: 'active' } });
      await this.audit.record(tx, ctx, { action: 'api_key.rotate', targetType: 'api_key', targetId: id });
      return { id, secret };
    });
  }

  async revoke(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.apiKey.findFirst({ where: { id, brandId: ctx.brandId!, terminalId: null }, select: { id: true } });
      if (!existing) throw new NotFoundException('api key not found');
      await tx.apiKey.update({ where: { id }, data: { status: 'revoked' } });
      await this.audit.record(tx, ctx, { action: 'api_key.revoke', targetType: 'api_key', targetId: id });
      return { id, revoked: true };
    });
  }
}
