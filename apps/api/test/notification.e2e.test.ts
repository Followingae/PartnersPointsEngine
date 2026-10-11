/**
 * Operator notification centre. Proves the feed a brand admin and a superadmin
 * see: publishing lands a row, the unread count drives the bell badge, read state
 * is per-operator (one admin reading it does not clear a teammate's badge),
 * repeats collapse by dedupe key, and the brand and platform feeds are separate.
 *
 * This harness connects as the database superuser, so RLS is bypassed (policies
 * are ENABLE, not FORCE) and the notification table is shared with other suites
 * (the fraud suite now publishes here too). Assertions therefore work on deltas
 * and filter to this suite's own rows by a unique `source` tag, rather than
 * assuming an empty table. Tenant isolation itself is the same `tenant_isolation`
 * policy as `fraud_alert`, exercised by the db package's RLS test.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { NotificationService } from '../src/modules/notifications/notification.service';

describe('Notification centre', () => {
  let prisma: PrismaClient;
  let notifications: NotificationService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const user1 = randomUUID();
  const user2 = randomUUID();
  // A tag unique to this suite, so assertions can ignore rows other suites wrote.
  const SRC = `test:${randomUUID()}`;
  let publishedId: string | null = null;

  // Two brand admins on the same brand (different users), plus the platform feed.
  const brandCtx = (userId: string): TenantContext => ({
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin',
    actor: { type: 'user', id: userId, onBehalfOf: null },
  });
  const platformCtx: TenantContext = {
    platformId, groupId: null, brandId: null, branchId: null, scopeLevel: 'platform', surface: 'superadmin',
    actor: { type: 'user', id: randomUUID(), onBehalfOf: null },
  };

  const mine = async (ctx: TenantContext, audience: 'brand' | 'platform', status?: 'unread' | 'all') =>
    (await notifications.list(ctx, audience, { status })).filter((n) => n.source === SRC);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    notifications = new NotificationService(tenants);
    await prisma.platform.create({ data: { id: platformId, name: 'A' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'Notif Cafe', slug: `n-${brandId.slice(0, 8)}` } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('publishes a brand notification and counts it unread', async () => {
    const before = await notifications.unreadCount(brandCtx(user1), 'brand');
    publishedId = await notifications.publish(brandCtx(user1), {
      audience: 'brand', source: SRC, severity: 'high', title: 'Cashier self-earn', body: 'A terminal keeps crediting one number.', link: '/fraud',
    });
    expect(publishedId).toBeTruthy();
    expect(await notifications.unreadCount(brandCtx(user1), 'brand')).toBe(before + 1);

    const unread = await mine(brandCtx(user1), 'brand', 'unread');
    expect(unread).toHaveLength(1);
    expect(unread[0]!.title).toBe('Cashier self-earn');
    expect(unread[0]!.severity).toBe('high');
  });

  it('tracks read state per operator', async () => {
    const u1Before = await notifications.unreadCount(brandCtx(user1), 'brand');
    const u2Before = await notifications.unreadCount(brandCtx(user2), 'brand');

    await notifications.markRead(brandCtx(user1), 'brand', publishedId!);

    // user1 read exactly one; user2, a different admin on the same brand, is untouched.
    expect(await notifications.unreadCount(brandCtx(user1), 'brand')).toBe(u1Before - 1);
    expect(await notifications.unreadCount(brandCtx(user2), 'brand')).toBe(u2Before);

    const asRead = await mine(brandCtx(user1), 'brand', 'all');
    expect(asRead.find((n) => n.id === publishedId)!.read).toBe(true);
  });

  it('collapses repeats that share a dedupe key', async () => {
    const key = `fraud:${randomUUID()}`;
    const first = await notifications.publish(brandCtx(user1), { audience: 'brand', source: SRC, title: 'Dup', dedupeKey: key });
    const second = await notifications.publish(brandCtx(user1), { audience: 'brand', source: SRC, title: 'Dup', dedupeKey: key });
    expect(first).toBeTruthy();
    expect(second).toBeNull(); // the conflicting insert is a no-op
  });

  it('keeps the brand and platform feeds separate', async () => {
    await notifications.publish(platformCtx, { audience: 'platform', source: SRC, severity: 'high', title: 'Cross-brand pattern', link: '/fraud' });

    const platform = await mine(platformCtx, 'platform', 'all');
    expect(platform.some((n) => n.title === 'Cross-brand pattern')).toBe(true);

    // The platform-audience row must not appear in the brand feed.
    const brand = await mine(brandCtx(user1), 'brand', 'all');
    expect(brand.some((n) => n.title === 'Cross-brand pattern')).toBe(false);
  });

  it('marks everything read in one call', async () => {
    await notifications.markAllRead(brandCtx(user2), 'brand');
    expect(await notifications.unreadCount(brandCtx(user2), 'brand')).toBe(0);
  });
});
