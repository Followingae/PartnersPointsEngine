/**
 * AUDIT 04 — Ledger integrity PoC. LOCAL ONLY: boots an ephemeral embedded
 * Postgres (port 54331), applies the repo's SQL, drives the real API services
 * (no Nest DI, owner role, RLS bypassed exactly like apps/api/test/*.e2e.test.ts)
 * and prints what the ledger looks like afterwards. Touches nothing outside
 * the temp data directory. Read-only with respect to the repo.
 *
 * Run from the repo root:
 *   cd apps/api && ../../node_modules/.bin/tsx --tsconfig tsconfig.json ../../AUDIT/poc/ledger_poc.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, ledger, INCREMENTAL_MIGRATIONS } from '../../packages/db/dist/index.js';
import type { TenantContext } from '../../packages/shared/dist/index.js';
import { EnvelopeCryptoService } from '../../apps/api/src/auth/crypto/envelope-crypto.service';
import { TokenService } from '../../apps/api/src/auth/tokens/token.service';
import { CampaignService } from '../../apps/api/src/modules/loyalty-rules/campaign.service';
import { GamificationService } from '../../apps/api/src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from '../../apps/api/src/modules/loyalty-rules/loyalty.service';
import { ReferralService } from '../../apps/api/src/modules/loyalty-rules/referral.service';
import { CouponService } from '../../apps/api/src/modules/coupons/coupon.service';
import { ExpirySweepService } from '../../apps/api/src/modules/workers/expiry-sweep.service';
import { TerminalService } from '../../apps/api/src/modules/terminal-gateway/terminal.service';
import { AuditService } from '../../apps/api/src/platform-core/audit/audit.service';
import { TenantService } from '../../apps/api/src/platform-core/tenancy/tenant.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const REPO = join(__dirname, '..', '..');

const fakeConfig = {
  get: (k: string) => ({ JWT_ACCESS_TTL_SECONDS: 900 } as Record<string, unknown>)[k],
  getOrThrow: (k: string) =>
    ({ JWT_ACCESS_SECRET: 'poc-access-secret-0123456789', JWT_REFRESH_SECRET: 'poc-refresh-secret-0123456789' } as Record<string, string>)[k],
} as never;

async function applySql(url: string) {
  const sqlDir = join(REPO, 'packages', 'db', 'prisma', 'sql');
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    for (const f of ['0001_baseline.sql', 'rls.sql', 'ledger.sql', ...INCREMENTAL_MIGRATIONS]) {
      await c.query(readFileSync(join(sqlDir, f), 'utf8'));
    }
  } finally {
    await c.end();
  }
}

function log(title: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'VULNERABLE' : 'not reproduced'}  ${title}\n    ${detail}`);
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'rfm-audit-poc-'));
  const port = 54331;
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
  await pg.initialise();
  await pg.start();
  const url = `postgresql://postgres:postgres@localhost:${port}/postgres?connection_limit=20`;
  try {
    await applySql(url);
    const prisma = new PrismaClient({ datasourceUrl: url });
    await prisma.$connect();
    try {
      await scenarios(prisma);
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    await pg.stop();
  }
}

async function scenarios(prisma: PrismaClient) {
  const tenants = new TenantService(prisma as never);
  const audit = new AuditService();
  const tokens = new TokenService(new JwtService({}), fakeConfig);
  const crypto = new EnvelopeCryptoService(fakeConfig);
  const gamification = new GamificationService(tenants, audit);
  const loyalty = new LoyaltyService(tenants, new CampaignService(tenants, audit), gamification, audit, crypto);
  const terminal = new TerminalService(tenants, tokens, loyalty, crypto);
  const referrals = new ReferralService(tenants);
  const coupons = new CouponService(tenants, audit);
  const expiry = new ExpirySweepService(tenants);

  // ── seed tenancy ───────────────────────────────────────────────────────────
  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();
  const branchId = randomUUID();
  const terminalId = randomUUID();
  await prisma.platform.create({ data: { id: platformId, name: 'P' } });
  await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
  await prisma.brand.create({ data: { id: brandId, groupId, platformId, name: 'B', slug: `b-${brandId.slice(0, 8)}` } });
  await prisma.branch.create({ data: { id: branchId, brandId, groupId, platformId, name: 'Br' } });
  await prisma.loyaltyEarnRule.create({
    data: { brandId, groupId, platformId, name: '1pt/AED', priority: 0, enabled: true, definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] } },
  });

  const terminalCtx: TenantContext = { platformId, groupId, brandId, branchId, scopeLevel: 'brand', surface: 'terminal', actor: { type: 'terminal', id: terminalId, onBehalfOf: null } };
  const brandSystemCtx: TenantContext = { platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'superadmin', actor: { type: 'system', id: platformId, onBehalfOf: null } };
  const adminCtx: TenantContext = { platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin', actor: { type: 'user', id: randomUUID(), onBehalfOf: null } };

  async function member(phone: string) {
    const person = await prisma.person.create({ data: { platformId, phoneHash: sha256(phone) } });
    const m = await prisma.customerMembership.create({ data: { personId: person.id, brandId, groupId, platformId, loyaltyId: `M-${phone.slice(-4)}` } });
    await prisma.customerIdentifier.create({ data: { membershipId: m.id, brandId, groupId, platformId, type: 'phone', valueHash: sha256(phone) } });
    const ctx: TenantContext = { platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'customer', actor: { type: 'customer', id: person.id, onBehalfOf: null } };
    return { personId: person.id, membershipId: m.id, ctx };
  }
  const available = async (membershipId: string) => (await loyalty.balance(brandSystemCtx, membershipId)).available;
  const pending = async (membershipId: string) => (await loyalty.balance(brandSystemCtx, membershipId)).pending;

  // ── A. In-app reward redeem: replaying the client idempotency key issues a new voucher each time ──
  {
    const a = await member('+971500000001');
    const { memberToken } = await terminal.resolve(terminalCtx, 'phone', '+971500000001');
    await terminal.transaction(terminalCtx, { intent: 'earn', memberToken, idempotencyKey: 'seedA', amountMinor: 50000 }); // 500 pts
    const item = await prisma.rewardCatalogItem.create({ data: { brandId, groupId, platformId, name: 'AED 20 Voucher', pointsCost: 200n, kind: 'voucher', payload: { discountMinor: 2000 } } });
    const key = 'app-redeem-replay-1';
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await loyalty.redeem(a.ctx, a.membershipId, item.id, key));
    const vouchers = await prisma.voucher.count({ where: { membershipId: a.membershipId, catalogItemId: item.id } });
    const codes = new Set(results.map((r) => r.voucher.code)).size;
    log('A  in-app redeem replay → N vouchers for one debit',
      vouchers > 1 && (await available(a.membershipId)) === '300',
      `5 calls, same idempotencyKey: vouchers issued=${vouchers} (distinct codes=${codes}), points debited once: available=${await available(a.membershipId)} (500-200). Each voucher is worth AED 20 at the till.`);
  }

  // ── B. Referral ping-pong: two accounts mint points without limit ──
  {
    const a = await member('+971500000002');
    const b = await member('+971500000003');
    const before = BigInt(await available(a.membershipId)) + BigInt(await available(b.membershipId));
    const rounds = 10;
    for (let i = 0; i < rounds; i++) {
      const { code: ca } = await referrals.getOrCreateCode(a.ctx, a.membershipId);
      await referrals.redeem(b.ctx, ca, b.membershipId);
      const { code: cb } = await referrals.getOrCreateCode(b.ctx, b.membershipId);
      await referrals.redeem(a.ctx, cb, a.membershipId);
    }
    const after = BigInt(await available(a.membershipId)) + BigInt(await available(b.membershipId));
    log('B  referral ping-pong mints unbounded points',
      after - before === BigInt(rounds) * 300n,
      `${rounds} rounds A↔B: combined balance ${before} → ${after} (+${after - before} pts, 300/round, no cap, no "new member" check, code re-issued after every use).`);
  }

  // ── C. Concurrent capture + void of the same authorized redemption ──
  {
    const c = await member('+971500000004');
    const { memberToken } = await terminal.resolve(terminalCtx, 'phone', '+971500000004');
    await terminal.transaction(terminalCtx, { intent: 'earn', memberToken, idempotencyKey: 'seedC', amountMinor: 50000 }); // 500
    let hit = false;
    let detail = '';
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // The till's crash-recovery void and a capture retry can land in either
    // order (and on either API instance). Try the void a few ms after the
    // capture so the capture reaches the balance row first.
    const delays = [0, 5, 10, 15, 20, 30, 40, 60, 80, 120];
    for (let attempt = 0; attempt < delays.length && !hit; attempt++) {
      const auth = await terminal.transaction(terminalCtx, { intent: 'redeem', memberToken, idempotencyKey: `redeemC-${attempt}`, points: 100 });
      const [cap, vd] = await Promise.allSettled([
        terminal.capture(terminalCtx, auth.id),
        sleep(delays[attempt]!).then(() => terminal.voidTxn(terminalCtx, auth.id)),
      ]);
      const t = await prisma.terminalTransaction.findUnique({ where: { id: auth.id } });
      const p = BigInt(await pending(c.membershipId));
      const av = BigInt(await available(c.membershipId));
      detail = `attempt ${attempt} (void delayed ${delays[attempt]}ms): capture=${cap.status} void=${vd.status} → txn.state=${t?.state} pending_debits=${p} available=${av}`;
      if (cap.status === 'fulfilled' && vd.status === 'fulfilled') hit = true;
      else if (t?.state === 'authorized') await terminal.voidTxn(terminalCtx, auth.id).catch(() => {});
    }
    const bal = await prisma.$queryRaw<{ posted_debits: bigint; pending_debits: bigint; entry_debits: bigint }[]>`
      SELECT ab.posted_debits, ab.pending_debits,
             (SELECT coalesce(sum(e.amount_minor),0) FROM entry e WHERE e.account_id = la.id AND e.direction='debit')::bigint AS entry_debits
        FROM ledger_account la JOIN account_balance ab ON ab.account_id = la.id
       WHERE la.customer_id=${c.membershipId} AND la.account_type='points_liability'`;
    log('C  capture ∥ void race → both succeed, pending goes negative, points refunded while revenue booked',
      hit,
      `${detail}; liability account: posted_debits=${bal[0]?.posted_debits} Σdebit entries=${bal[0]?.entry_debits} pending_debits=${bal[0]?.pending_debits}.`);
  }

  // ── D. Two expiry sweeps at once (2 API instances) over-expire ──
  {
    const d = await member('+971500000005');
    const scope = { platformId, groupId, brandId, customerId: d.membershipId };
    const yesterday = new Date(Date.now() - 86_400_000);
    const nextYear = new Date(Date.now() + 365 * 86_400_000);
    await prisma.$transaction((tx) => ledger.earnPoints(tx, { scope, points: 100n, occurredAt: new Date(), idem: { actorId: d.membershipId, key: 'old' }, expiryBucket: yesterday }));
    await prisma.$transaction((tx) => ledger.earnPoints(tx, { scope, points: 300n, occurredAt: new Date(), idem: { actorId: d.membershipId, key: 'new' }, expiryBucket: nextYear }));
    // After the first ever sweep the breakage account exists; pre-create it so
    // the race is about the expiry maths, not account creation. (Without this,
    // the second sweep dies with 25P02: engine.getOrCreateAccount's "lost the
    // create race → re-read" cannot work on Postgres, the tx is already aborted.)
    await prisma.$transaction((tx) => ledger.getOrCreateAccount(tx, { ledger: 'points', accountType: 'breakage_income', normalSide: 'credit', assetCode: `PTS:${brandId}`, platformId, groupId, brandId, customerId: null }));
    // both "instances" tick together
    const [r1, r2] = await Promise.all([expiry.sweepBrand(brandSystemCtx), expiry.sweepBrand(brandSystemCtx)]);
    const av = await available(d.membershipId);
    const expired = await prisma.$queryRaw<{ x: bigint }[]>`
      SELECT coalesce(sum(e.amount_minor),0)::bigint AS x FROM entry e JOIN ledger_account la ON la.id=e.account_id
       WHERE la.customer_id=${d.membershipId} AND e.point_state='expired'`;
    log('D  concurrent expiry sweeps double-expire',
      BigInt(expired[0]?.x ?? 0n) > 100n,
      `expired bucket held 100 pts; sweeps reported ${r1.pointsExpired} + ${r2.pointsExpired}; expiry entries total ${expired[0]?.x} pts; customer available ${av} (should be 300).`);
    // re-run alone: idempotent?
    const r3 = await expiry.sweepBrand(brandSystemCtx);
    console.log(`    sequential re-run afterwards expired ${r3.pointsExpired} more (sequential idempotency holds).`);
  }

  // ── D2. engine.getOrCreateAccount create-race recovery is dead code on Postgres ──
  {
    const cust = randomUUID();
    const spec = { ledger: 'points' as const, accountType: 'points_liability', normalSide: 'credit' as const, assetCode: `PTS:${brandId}`, platformId, groupId, brandId, customerId: cust };
    const rs = await Promise.allSettled([
      prisma.$transaction(async (tx) => { const a = await ledger.getOrCreateAccount(tx, spec); await new Promise((r) => setTimeout(r, 50)); return a.id; }),
      prisma.$transaction(async (tx) => { await new Promise((r) => setTimeout(r, 10)); const a = await ledger.getOrCreateAccount(tx, spec); return a.id; }),
    ]);
    const failed = rs.filter((r) => r.status === 'rejected');
    const msg = failed.map((r) => (r as PromiseRejectedResult).reason?.message ?? '').join(' | ').replace(/\s+/g, ' ').slice(0, 160);
    log('D2 first-touch account creation race aborts the whole transaction (25P02), recovery path unreachable',
      failed.length > 0,
      `two txns create the same customer's first account: ${rs.map((r) => r.status).join(',')} — ${msg}`);
  }

  // ── E. Terminal redeem authorize is not valued/capped server-side ──
  {
    const e = await member('+971500000006');
    const { memberToken } = await terminal.resolve(terminalCtx, 'phone', '+971500000006');
    await terminal.transaction(terminalCtx, { intent: 'earn', memberToken, idempotencyKey: 'seedE', amountMinor: 100000 }); // 1000 pts
    await prisma.redemptionConfig.create({ data: { brandId, groupId, platformId, enabled: true, ratePoints: 100n, rateValueMinor: 100n, minRedeemPoints: 500n, maxPercentOfBillBps: 5000, roundToMinor: 1, presetsPoints: [] } });
    const q = await terminal.quote(terminalCtx, { memberToken, amountMinor: 100, redeemPoints: 1000 });
    const auth = await terminal.transaction(terminalCtx, { intent: 'redeem', memberToken, idempotencyKey: 'redeemE', points: 1000, amountMinor: 100 });
    const cap = await terminal.capture(terminalCtx, auth.id);
    log('E  redeem accepted beyond bill cap / below minimum (quote is advisory only)',
      cap.state === 'captured',
      `bill AED 1.00, maxPercentOfBill 50%, min 500: quote says value=${q.redeem?.valueMinor} fils belowMinimum=${q.redeem?.belowMinimum}; authorize+capture of 1000 pts still ${cap.state}. Settlement will charge the group wallet for 1000 pts.`);
  }

  // ── F. Coupon maxRedemptions race ──
  {
    const gen = await coupons.bulkGenerate(adminCtx, { pattern: 'ONE-####', count: 1, kind: 'discount', valueMinor: 5000, maxRedemptions: 1 });
    const code = gen.sample[0]!;
    const rs = await Promise.allSettled(Array.from({ length: 6 }, () => coupons.redeem(adminCtx, code)));
    const okCount = rs.filter((r) => r.status === 'fulfilled').length;
    const row = await prisma.coupon.findFirst({ where: { brandId, code }, select: { redeemedCount: true, maxRedemptions: true } });
    log('F  coupon over-redemption under concurrency (read-then-increment)',
      okCount > 1,
      `maxRedemptions=1, 6 concurrent redeems → ${okCount} succeeded, redeemed_count=${row?.redeemedCount}.`);
  }

  // ── G. Reconciliation SQL ──
  {
    const drift = await prisma.$queryRaw<{ account_id: string; account_type: string; posted_credits: bigint; posted_debits: bigint; pending_debits: bigint; entry_credits: bigint; entry_debits: bigint }[]>`
      SELECT ab.account_id, la.account_type, ab.posted_credits, ab.posted_debits, ab.pending_debits,
             coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='credit'),0)::bigint AS entry_credits,
             coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='debit'),0)::bigint  AS entry_debits
        FROM account_balance ab
        JOIN ledger_account la ON la.id = ab.account_id
        LEFT JOIN entry e ON e.account_id = ab.account_id
       GROUP BY ab.account_id, la.account_type, ab.posted_credits, ab.posted_debits, ab.pending_debits
      HAVING ab.posted_credits <> coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='credit'),0)
          OR ab.posted_debits  <> coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='debit'),0)
          OR ab.pending_debits < 0`;
    const imbalance = await prisma.$queryRaw<{ i: bigint }[]>`
      SELECT coalesce(sum(CASE WHEN direction='debit' THEN amount_minor ELSE -amount_minor END),0)::bigint AS i FROM entry`;
    const openHolds = await prisma.$queryRaw<{ held: bigint; pend: bigint }[]>`
      SELECT (SELECT coalesce(sum(points),0) FROM terminal_transaction WHERE state='authorized' AND intent='redeem')::bigint AS held,
             (SELECT coalesce(sum(pending_debits),0) FROM account_balance)::bigint AS pend`;
    console.log(`\nRECONCILIATION  Σ signed entries = ${imbalance[0]?.i} (journal-level invariant holds: ${imbalance[0]?.i === 0n})`);
    console.log(`RECONCILIATION  accounts whose materialised balance ≠ Σ entries, or pending < 0: ${drift.length}`);
    for (const r of drift) console.log(`    ${r.account_type} ${r.account_id}: posted_credits=${r.posted_credits}/entries=${r.entry_credits} posted_debits=${r.posted_debits}/entries=${r.entry_debits} pending=${r.pending_debits}`);
    console.log(`RECONCILIATION  Σ pending_debits=${openHolds[0]?.pend} vs Σ points of 'authorized' terminal txns=${openHolds[0]?.held}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
