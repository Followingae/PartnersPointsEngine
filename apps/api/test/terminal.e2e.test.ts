/**
 * Phase 4 integration: drive the TerminalService (resolve → earn → redeem
 * authorize → capture, idempotent replay, offline batch) against embedded
 * Postgres. Services are instantiated directly (no Nest DI); the owner connection
 * bypasses RLS so we exercise the transaction state machine + ledger composition.
 */
import { createHash, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokenService } from '../src/auth/tokens/token.service';
import { CampaignService } from '../src/modules/loyalty-rules/campaign.service';
import { GamificationService } from '../src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from '../src/modules/loyalty-rules/loyalty.service';
import { AuditService } from '../src/platform-core/audit/audit.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';
import { TerminalService } from '../src/modules/terminal-gateway/terminal.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const fakeConfig = {
  get: (k: string) => ({ JWT_ACCESS_TTL_SECONDS: 900 })[k as 'JWT_ACCESS_TTL_SECONDS'],
  getOrThrow: (k: string) =>
    ({ JWT_ACCESS_SECRET: 'test-access-secret-0123456789', JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789' })[
      k as 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'
    ],
} as never;

describe('Terminal gateway (Phase 4)', () => {
  let prisma: PrismaClient;
  let terminal: TerminalService;
  let loyalty: LoyaltyService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const branchId = randomUUID();
  const terminalId = randomUUID();
  const phone = '+971500000999';
  let membershipId: string;

  const ctx: TenantContext = {
    platformId,
    groupId,
    brandId,
    branchId,
    scopeLevel: 'brand',
    surface: 'terminal',
    actor: { type: 'terminal', id: terminalId, onBehalfOf: null },
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    const tenants = new TenantService(prisma as never);
    const audit = new AuditService();
    const tokens = new TokenService(new JwtService({}), fakeConfig);
    loyalty = new LoyaltyService(tenants, new CampaignService(tenants, audit), new GamificationService(tenants, audit), audit);
    terminal = new TerminalService(tenants, tokens, loyalty);

    // Seed tenancy + member + identifier + an earn rule (as owner; RLS bypassed).
    await prisma.platform.create({ data: { id: platformId, name: 'T' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });
    await prisma.branch.create({ data: { id: branchId, brandId, groupId, platformId, name: 'Br' } });
    const person = await prisma.person.create({ data: { platformId, phoneHash: sha256(phone) } });
    const m = await prisma.customerMembership.create({
      data: { personId: person.id, brandId, groupId, platformId, loyaltyId: 'M-1' },
    });
    membershipId = m.id;
    await prisma.customerIdentifier.create({
      data: { membershipId: m.id, brandId, groupId, platformId, type: 'phone', valueHash: sha256(phone) },
    });
    await prisma.loyaltyEarnRule.create({
      data: { brandId, groupId, platformId, name: '1pt/AED', priority: 0, enabled: true, definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolves an identifier to a member token', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    expect(typeof memberToken).toBe('string');
  });

  it('earns at the POS (single-step capture) and reflects the balance', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const txn = await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: 'pos-earn-1', amountMinor: 10000 });
    expect(txn.state).toBe('captured');
    expect(txn.points).toBe('100');
    const bal = await loyalty.balance(ctx, membershipId);
    expect(bal.available).toBe('100');
  });

  it('is idempotent: replaying an earn returns the same transaction', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const a = await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: 'pos-earn-dup', amountMinor: 5000 });
    const b = await terminal.transaction(ctx, { intent: 'earn', memberToken, idempotencyKey: 'pos-earn-dup', amountMinor: 5000 });
    expect(b.id).toBe(a.id);
    const bal = await loyalty.balance(ctx, membershipId);
    expect(bal.available).toBe('150'); // 100 + 50 (dup applied once)
  });

  it('redeems via authorize → capture', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const auth = await terminal.transaction(ctx, { intent: 'redeem', memberToken, idempotencyKey: 'pos-redeem-1', points: 40 });
    expect(auth.state).toBe('authorized');
    const cap = await terminal.capture(ctx, auth.id);
    expect(cap.state).toBe('captured');
    const bal = await loyalty.balance(ctx, membershipId);
    expect(bal.available).toBe('110'); // 150 - 40
  });

  it('replays an offline batch, deduping by idempotency key', async () => {
    const { memberToken } = await terminal.resolve(ctx, 'phone', phone);
    const ops = [
      { intent: 'earn' as const, memberToken, idempotencyKey: 'batch-1', amountMinor: 2000 },
      { intent: 'earn' as const, memberToken, idempotencyKey: 'batch-1', amountMinor: 2000 }, // dup
    ];
    const r1 = await terminal.batch(ctx, ops);
    expect(r1.results.every((x) => x.ok)).toBe(true);
    const bal = await loyalty.balance(ctx, membershipId);
    expect(bal.available).toBe('130'); // 110 + 20 (batch dup applied once)
  });
});
