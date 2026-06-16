import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

const MAX_ATTEMPTS = 6;

/** Event types the platform emits — surfaced in the endpoint subscription picker. */
export const WEBHOOK_EVENT_TYPES = [
  'earn', 'redeem', 'redeem.authorized', 'redeem.captured', 'redeem.voided',
  'tier.changed', 'badge.awarded', 'challenge.completed', 'referral.qualified',
  'change_request.created', 'change_request.approved', 'change_request.rejected',
  'wallet.low_balance', 'points.expiring',
];

/**
 * Webhook subscription + delivery (Phase 5). The transactional outbox is relayed
 * into per-endpoint delivery rows; delivery is HMAC-signed, retried with backoff,
 * and dead-lettered after MAX_ATTEMPTS. `fetchImpl` is overridable for testing.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  fetchImpl: typeof fetch = globalThis.fetch;

  constructor(
    private readonly tenants: TenantService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly audit: AuditService,
  ) {}

  async createEndpoint(ctx: TenantContext, url: string, events: string[], secret: string) {
    return this.tenants.run(ctx, (tx) =>
      tx.webhookEndpoint.create({
        data: {
          brandId: ctx.brandId!,
          groupId: ctx.groupId!,
          platformId: ctx.platformId,
          url,
          events,
          secretEnc: this.crypto.encrypt(secret),
        },
        select: { id: true, url: true, events: true },
      }),
    );
  }

  // ── management surface (W4) ─────────────────────────────────────────────────

  eventTypes() {
    return WEBHOOK_EVENT_TYPES;
  }

  /** Register an endpoint, generating a signing secret returned ONCE. */
  async register(ctx: TenantContext, url: string, events: string[]) {
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    return this.tenants.run(ctx, async (tx) => {
      const ep = await tx.webhookEndpoint.create({
        data: { brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, url, events, secretEnc: this.crypto.encrypt(secret) },
        select: { id: true, url: true, events: true, enabled: true, createdAt: true },
      });
      await this.audit.record(tx, ctx, { action: 'webhook.create', targetType: 'webhook_endpoint', targetId: ep.id, data: { url, events } });
      return { ...ep, secret }; // secret shown once
    });
  }

  async listEndpoints(ctx: TenantContext) {
    return this.tenants
      .run(ctx, (tx) => tx.webhookEndpoint.findMany({ where: { brandId: ctx.brandId! }, orderBy: { createdAt: 'desc' }, select: { id: true, url: true, events: true, enabled: true, createdAt: true } }))
      .then((rows) => rows);
  }

  async updateEndpoint(ctx: TenantContext, id: string, dto: { url?: string; events?: string[]; enabled?: boolean }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.webhookEndpoint.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('endpoint not found');
      const ep = await tx.webhookEndpoint.update({
        where: { id },
        data: { ...(dto.url !== undefined ? { url: dto.url } : {}), ...(dto.events !== undefined ? { events: dto.events } : {}), ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}) },
        select: { id: true, url: true, events: true, enabled: true },
      });
      await this.audit.record(tx, ctx, { action: 'webhook.update', targetType: 'webhook_endpoint', targetId: id, data: { fields: Object.keys(dto) } });
      return ep;
    });
  }

  async deleteEndpoint(ctx: TenantContext, id: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.webhookEndpoint.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('endpoint not found');
      await tx.webhookEndpoint.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'webhook.delete', targetType: 'webhook_endpoint', targetId: id });
      return { id, deleted: true };
    });
  }

  async rotateSecret(ctx: TenantContext, id: string) {
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.webhookEndpoint.findFirst({ where: { id, brandId: ctx.brandId! }, select: { id: true } });
      if (!existing) throw new NotFoundException('endpoint not found');
      await tx.webhookEndpoint.update({ where: { id }, data: { secretEnc: this.crypto.encrypt(secret) } });
      await this.audit.record(tx, ctx, { action: 'webhook.rotate_secret', targetType: 'webhook_endpoint', targetId: id });
      return { id, secret };
    });
  }

  async listDeliveries(ctx: TenantContext, query: { endpointId?: string; status?: string; limit?: number; offset?: number } = {}) {
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.WebhookDeliveryWhereInput = {
        brandId: ctx.brandId!,
        ...(query.endpointId ? { endpointId: query.endpointId } : {}),
        ...(query.status && query.status !== 'all' ? { status: query.status as never } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.webhookDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(query.limit ?? 50, 200), skip: query.offset ?? 0, select: { id: true, endpointId: true, eventType: true, status: true, attempts: true, lastError: true, createdAt: true, deliveredAt: true } }),
        tx.webhookDelivery.count({ where }),
      ]);
      return { rows, total };
    });
  }

  /** Fire a synthetic signed event at an endpoint and report the result (no persistence). */
  async testFire(ctx: TenantContext, id: string) {
    const ep = await this.tenants.run(ctx, (tx) => tx.webhookEndpoint.findFirst({ where: { id, brandId: ctx.brandId! } }));
    if (!ep) throw new NotFoundException('endpoint not found');
    const body = JSON.stringify({ id: `test_${Date.now()}`, type: 'test.ping', data: { ok: true, brandId: ctx.brandId } });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac('sha256', this.crypto.decrypt(ep.secretEnc)).update(`${ts}.${body}`).digest('hex');
    try {
      const res = await this.fetchImpl(ep.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Loyalty-Signature': `t=${ts},v1=${sig}`, 'X-Loyalty-Event-Id': 'test' }, body });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, status: 0, error: e instanceof Error ? e.message : 'error' };
    }
  }

  /** Relay unpublished outbox rows for the brand into delivery rows. */
  async relayOutbox(ctx: TenantContext): Promise<{ relayed: number }> {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.outbox.findMany({
        where: { brandId: ctx.brandId!, publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      let relayed = 0;
      for (const row of rows) {
        const endpoints = await tx.webhookEndpoint.findMany({ where: { brandId: ctx.brandId!, enabled: true } });
        for (const ep of endpoints) {
          if (!ep.events.includes('*') && !ep.events.includes(row.eventType)) continue;
          await tx.webhookDelivery.create({
            data: {
              brandId: ctx.brandId!,
              groupId: ctx.groupId!,
              platformId: ctx.platformId,
              endpointId: ep.id,
              eventId: row.id,
              eventType: row.eventType,
              payload: row.payload as Prisma.InputJsonValue,
            },
          });
          relayed += 1;
        }
        await tx.outbox.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
      }
      return { relayed };
    });
  }

  /** Deliver pending/failed deliveries that are due. */
  async deliverPending(ctx: TenantContext): Promise<{ delivered: number; failed: number }> {
    const pending = await this.tenants.run(ctx, (tx) =>
      tx.webhookDelivery.findMany({
        where: { brandId: ctx.brandId!, status: { in: ['pending', 'failed'] }, attempts: { lt: MAX_ATTEMPTS } },
        include: { endpoint: true },
        take: 100,
      }),
    );

    let delivered = 0;
    let failed = 0;
    for (const d of pending) {
      const body = JSON.stringify({ id: d.eventId, type: d.eventType, data: d.payload });
      const ts = Math.floor(Date.now() / 1000).toString();
      const secret = this.crypto.decrypt(d.endpoint.secretEnc);
      const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
      try {
        const res = await this.fetchImpl(d.endpoint.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Loyalty-Signature': `t=${ts},v1=${sig}`, 'X-Loyalty-Event-Id': d.eventId },
          body,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        await this.tenants.run(ctx, (tx) =>
          tx.webhookDelivery.update({ where: { id: d.id }, data: { status: 'delivered', attempts: d.attempts + 1, deliveredAt: new Date() } }),
        );
        delivered += 1;
      } catch (e) {
        const attempts = d.attempts + 1;
        await this.tenants.run(ctx, (tx) =>
          tx.webhookDelivery.update({
            where: { id: d.id },
            data: { status: attempts >= MAX_ATTEMPTS ? 'dead' : 'failed', attempts, lastError: e instanceof Error ? e.message : 'error' },
          }),
        );
        failed += 1;
      }
    }
    return { delivered, failed };
  }
}
