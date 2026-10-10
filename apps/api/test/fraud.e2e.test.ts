/**
 * Fraud detection. Proves the evaluator raises deduped alerts for the patterns
 * a brand and the platform care about — a cashier farming one number, a member
 * earning too often — and that re-evaluation does not duplicate an alert.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmailService } from '../src/platform-core/email/email.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { FraudService } from '../src/modules/fraud/fraud.service';

const fakeConfig = { get: () => undefined, getOrThrow: () => '' } as never;

describe('Fraud detection', () => {
  let prisma: PrismaClient;
  let fraud: FraudService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const terminalId = randomUUID();
  let membershipId: string;

  const ctx: TenantContext = {
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin',
    actor: { type: 'user', id: randomUUID(), onBehalfOf: null },
  };

  const earn = (points: number) =>
    prisma.terminalTransaction.create({
      data: {
        brandId, groupId, platformId, terminalId, membershipId,
        actorId: terminalId, intent: 'earn', state: 'captured',
        points: BigInt(points), idempotencyKey: `e-${randomUUID()}`,
      },
    });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    fraud = new FraudService(tenants, new EmailService(fakeConfig), fakeConfig);

    await prisma.platform.create({ data: { id: platformId, name: 'A' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'Fraud Cafe', slug: `f-${brandId.slice(0, 8)}` } });
    const person = await prisma.person.create({ data: { platformId, phoneHash: randomUUID() } });
    const m = await prisma.customerMembership.create({
      data: { personId: person.id, brandId, groupId, platformId, loyaltyId: 'F-1' },
    });
    membershipId = m.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('flags a terminal farming one membership (6 earns > default 5)', async () => {
    for (let i = 0; i < 6; i++) await earn(10); // low points so only the self-earn rule trips
    const { raised } = await fraud.evaluateBrand(ctx);
    expect(raised).toBeGreaterThanOrEqual(1);

    const alerts = await fraud.listAlerts(ctx, {});
    const selfEarn = alerts.find((a) => a.ruleKey === 'terminal_self_earn');
    expect(selfEarn).toBeDefined();
    expect(selfEarn!.subjectId).toBe(`${terminalId}:${membershipId}`);
    expect(Number(selfEarn!.metricValue)).toBe(6);
    expect(selfEarn!.status).toBe('open');
  });

  it('does not raise a duplicate alert for the same window', async () => {
    const before = (await fraud.listAlerts(ctx, {})).length;
    const { raised } = await fraud.evaluateBrand(ctx);
    expect(raised).toBe(0);
    const after = (await fraud.listAlerts(ctx, {})).length;
    expect(after).toBe(before);
  });

  it('lets a brand tighten a threshold, then detects against it', async () => {
    await fraud.setRule(ctx, 'member_velocity_daily', { thresholdNum: '3' });
    const { raised } = await fraud.evaluateBrand(ctx);
    expect(raised).toBeGreaterThanOrEqual(1);
    const alerts = await fraud.listAlerts(ctx, {});
    expect(alerts.some((a) => a.ruleKey === 'member_velocity_daily')).toBe(true);
  });

  it('acknowledges and resolves an alert', async () => {
    const open = (await fraud.listAlerts(ctx, { status: 'open' }))[0]!;
    const ack = await fraud.acknowledge(ctx, open.id);
    expect(ack.status).toBe('acknowledged');
    const res = await fraud.resolve(ctx, open.id);
    expect(res.status).toBe('resolved');
  });
});
