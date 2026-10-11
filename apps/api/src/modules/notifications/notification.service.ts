import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

type Tx = Prisma.TransactionClient;

export type NotificationAudience = 'brand' | 'platform';
export type NotificationSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface PublishInput {
  audience: NotificationAudience;
  source: string;
  severity?: NotificationSeverity;
  category?: string;
  title: string;
  body?: string;
  link?: string | null;
  data?: Record<string, unknown>;
  /** Collapse repeats of the same event into one row. */
  dedupeKey?: string | null;
  relatedId?: string | null;
}

interface NotificationRow {
  id: string;
  audience: string;
  source: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  data: unknown;
  brandId: string | null;
  relatedId: string | null;
  createdAt: Date;
  read: boolean;
}

/**
 * Operator notification centre. A server-driven, persisted feed that the consoles
 * surface as a bell + dropdown + page. Any backend event can publish into it; the
 * fraud module is the first producer.
 *
 * Everything runs through TenantService (RLS). The caller must pass a context
 * whose scope matches the audience: a brand-audience notification is published
 * under a brand-scoped context (so brand admins and the platform both see it);
 * a platform-audience notification under a platform-scoped context (so only the
 * superadmin sees it, never a brand). Read state is per operator.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly tenants: TenantService) {}

  /**
   * Insert a notification. `ctx` must already be scoped to match `audience`
   * (brand-scoped for 'brand', platform-scoped for 'platform') or the RLS
   * WITH CHECK will reject the row. Returns the new id, or null if a row with
   * the same dedupe key already existed.
   */
  async publish(ctx: TenantContext, input: PublishInput): Promise<string | null> {
    const brandId = input.audience === 'brand' ? ctx.brandId ?? null : null;
    const groupId = input.audience === 'brand' ? ctx.groupId ?? null : null;
    const severity = input.severity ?? 'info';
    const category = input.category ?? 'alert';
    const body = input.body ?? '';
    const data = JSON.stringify(input.data ?? {});

    const id = await this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO notification
          (platform_id, group_id, brand_id, audience, source, category, severity, title, body, link, data, dedupe_key, related_id)
        VALUES
          (${ctx.platformId}, ${groupId}, ${brandId}, ${input.audience}, ${input.source}, ${category}, ${severity},
           ${input.title}, ${body}, ${input.link ?? null}, ${data}::jsonb, ${input.dedupeKey ?? null}, ${input.relatedId ?? null})
        ON CONFLICT (platform_id, audience, COALESCE(brand_id, ''), dedupe_key) WHERE dedupe_key IS NOT NULL
        DO NOTHING
        RETURNING id`;
      return rows[0]?.id ?? null;
    });
    return id;
  }

  /** Notifications for this operator's audience, newest first, with read flag. */
  async list(
    ctx: TenantContext,
    audience: NotificationAudience,
    opts: { status?: 'unread' | 'all'; limit?: number } = {},
  ): Promise<NotificationRow[]> {
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const userId = ctx.actor.id;
    return this.tenants.run(ctx, async (tx) => {
      const base = (onlyUnread: boolean) =>
        onlyUnread
          ? tx.$queryRaw<NotificationRow[]>`
              SELECT n.id, n.audience, n.source, n.category, n.severity, n.title, n.body, n.link,
                     n.data, n.brand_id AS "brandId", n.related_id AS "relatedId", n.created_at AS "createdAt",
                     false AS read
                FROM notification n
                LEFT JOIN notification_read r ON r.notification_id = n.id AND r.user_id = ${userId}
               WHERE n.audience = ${audience} AND r.notification_id IS NULL
               ORDER BY n.created_at DESC
               LIMIT ${take}`
          : tx.$queryRaw<NotificationRow[]>`
              SELECT n.id, n.audience, n.source, n.category, n.severity, n.title, n.body, n.link,
                     n.data, n.brand_id AS "brandId", n.related_id AS "relatedId", n.created_at AS "createdAt",
                     (r.notification_id IS NOT NULL) AS read
                FROM notification n
                LEFT JOIN notification_read r ON r.notification_id = n.id AND r.user_id = ${userId}
               WHERE n.audience = ${audience}
               ORDER BY n.created_at DESC
               LIMIT ${take}`;
      return base(opts.status === 'unread');
    });
  }

  /** How many notifications this operator has not yet read. */
  async unreadCount(ctx: TenantContext, audience: NotificationAudience): Promise<number> {
    const userId = ctx.actor.id;
    const rows = await this.tenants.run(ctx, (tx) =>
      tx.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count
          FROM notification n
         WHERE n.audience = ${audience}
           AND NOT EXISTS (
             SELECT 1 FROM notification_read r WHERE r.notification_id = n.id AND r.user_id = ${userId}
           )`,
    );
    return rows[0]?.count ?? 0;
  }

  /** Mark one notification read for this operator. */
  async markRead(ctx: TenantContext, audience: NotificationAudience, id: string): Promise<{ ok: true }> {
    const userId = ctx.actor.id;
    await this.tenants.run(ctx, async (tx) => {
      const found = await tx.$queryRaw<
        { platform_id: string; group_id: string | null; brand_id: string | null }[]
      >`SELECT platform_id, group_id, brand_id FROM notification WHERE id = ${id} AND audience = ${audience} LIMIT 1`;
      if (found.length === 0) throw new NotFoundException('notification not found');
      await this.insertRead(tx, id, userId, found[0]!);
    });
    return { ok: true };
  }

  /** Mark every currently-unread notification read for this operator. */
  async markAllRead(ctx: TenantContext, audience: NotificationAudience): Promise<{ marked: number }> {
    const userId = ctx.actor.id;
    const marked = await this.tenants.run(ctx, (tx) =>
      tx.$executeRaw`
        INSERT INTO notification_read (notification_id, user_id, platform_id, group_id, brand_id)
        SELECT n.id, ${userId}, n.platform_id, n.group_id, n.brand_id
          FROM notification n
         WHERE n.audience = ${audience}
           AND NOT EXISTS (
             SELECT 1 FROM notification_read r WHERE r.notification_id = n.id AND r.user_id = ${userId}
           )
        ON CONFLICT (notification_id, user_id) DO NOTHING`,
    );
    return { marked };
  }

  private async insertRead(
    tx: Tx,
    notificationId: string,
    userId: string,
    scope: { platform_id: string; group_id: string | null; brand_id: string | null },
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO notification_read (notification_id, user_id, platform_id, group_id, brand_id)
      VALUES (${notificationId}, ${userId}, ${scope.platform_id}, ${scope.group_id}, ${scope.brand_id})
      ON CONFLICT (notification_id, user_id) DO NOTHING`;
  }
}
