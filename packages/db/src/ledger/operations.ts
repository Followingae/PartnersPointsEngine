/**
 * High-level ledger operations (Phase 2): earn, redeem (authorize→capture/void),
 * wallet top-up, and the hybrid drawdown. Each is idempotent and composes the
 * engine primitives within the caller's transaction.
 */
import { createHash } from 'node:crypto';
import {
  captureHold,
  completeIdempotency,
  creditAccount,
  getBalance,
  getOrCreateAccount,
  holdPending,
  LedgerError,
  pointsAsset,
  postJournal,
  releasePending,
  reserveIdempotency,
  type Balance,
  type Leg,
  type Scope,
  type Tx,
} from './engine';

export const ACCOUNT_TYPES = {
  pointsLiability: 'points_liability',
  pointsExpense: 'points_expense',
  pointsRevenue: 'points_revenue',
  breakageIncome: 'breakage_income',
  walletLiability: 'wallet_liability',
  cashClearing: 'cash_clearing',
  redemptionCost: 'redemption_cost',
  platformFee: 'platform_fee',
} as const;

const hash = (parts: unknown) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

interface Idem {
  actorId: string;
  key: string;
}

interface BrandCustomerScope extends Scope {
  brandId: string;
  customerId: string;
}

// ── Points: earn ──────────────────────────────────────────────────────────────

export interface EarnArgs {
  scope: BrandCustomerScope;
  points: bigint;
  occurredAt: Date;
  sourceEvent?: string;
  idem: Idem;
  expiryBucket?: Date | null;
}

export async function earnPoints(tx: Tx, a: EarnArgs): Promise<{ journalId: string; balance: Balance }> {
  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash(['earn', a.scope.brandId, a.scope.customerId, a.points.toString(), a.sourceEvent]),
    scope: a.scope,
  });
  const asset = pointsAsset(a.scope.brandId);
  const liability = await getOrCreateAccount(tx, {
    ledger: 'points',
    accountType: ACCOUNT_TYPES.pointsLiability,
    normalSide: 'credit',
    assetCode: asset,
    platformId: a.scope.platformId,
    groupId: a.scope.groupId,
    brandId: a.scope.brandId,
    customerId: a.scope.customerId,
  });
  if (idem.state === 'replay') {
    return { journalId: (idem.response as { journalId: string }).journalId, balance: await getBalance(tx, liability.id) };
  }
  const expense = await getOrCreateAccount(tx, {
    ledger: 'points',
    accountType: ACCOUNT_TYPES.pointsExpense,
    normalSide: 'debit',
    assetCode: asset,
    platformId: a.scope.platformId,
    groupId: a.scope.groupId,
    brandId: a.scope.brandId,
  });

  const journalId = await postJournal(tx, {
    ledger: 'points',
    kind: 'earn',
    occurredAt: a.occurredAt,
    sourceEvent: a.sourceEvent,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs: [
      { accountId: expense.id, normalSide: 'debit', direction: 'debit', amountMinor: a.points, assetCode: asset },
      {
        accountId: liability.id,
        normalSide: 'credit',
        direction: 'credit',
        amountMinor: a.points,
        assetCode: asset,
        pointState: 'active',
        expiryBucket: a.expiryBucket ?? null,
      },
    ],
  });
  await completeIdempotency(tx, idem.keyId, { journalId });
  return { journalId, balance: await getBalance(tx, liability.id) };
}

// ── Points: redeem authorize → capture / void ─────────────────────────────────

export interface RedeemArgs {
  scope: BrandCustomerScope;
  points: bigint;
  occurredAt: Date;
  sourceEvent?: string;
  idem: Idem;
}

export async function authorizeRedeem(tx: Tx, a: RedeemArgs): Promise<{ journalId: string }> {
  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash(['redeem_auth', a.scope.brandId, a.scope.customerId, a.points.toString(), a.sourceEvent]),
    scope: a.scope,
  });
  if (idem.state === 'replay') return idem.response as { journalId: string };

  const asset = pointsAsset(a.scope.brandId);
  const liability = await getOrCreateAccount(tx, {
    ledger: 'points',
    accountType: ACCOUNT_TYPES.pointsLiability,
    normalSide: 'credit',
    assetCode: asset,
    platformId: a.scope.platformId,
    groupId: a.scope.groupId,
    brandId: a.scope.brandId,
    customerId: a.scope.customerId,
  });
  const ok = await holdPending(tx, liability.id, a.points);
  if (!ok) throw new LedgerError('insufficient_balance');

  // Audit-only journal for the hold (no balanced entries; the hold is a reservation).
  const journalId = await postJournal(tx, {
    ledger: 'points',
    kind: 'redeem_auth',
    occurredAt: a.occurredAt,
    sourceEvent: a.sourceEvent,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs: [],
  });
  await completeIdempotency(tx, idem.keyId, { journalId });
  return { journalId };
}

export async function captureRedeem(tx: Tx, a: RedeemArgs): Promise<{ journalId: string }> {
  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash(['redeem_capture', a.scope.brandId, a.scope.customerId, a.points.toString(), a.sourceEvent]),
    scope: a.scope,
  });
  if (idem.state === 'replay') return idem.response as { journalId: string };

  const asset = pointsAsset(a.scope.brandId);
  const liability = await getOrCreateAccount(tx, {
    ledger: 'points',
    accountType: ACCOUNT_TYPES.pointsLiability,
    normalSide: 'credit',
    assetCode: asset,
    platformId: a.scope.platformId,
    groupId: a.scope.groupId,
    brandId: a.scope.brandId,
    customerId: a.scope.customerId,
  });
  const revenue = await getOrCreateAccount(tx, {
    ledger: 'points',
    accountType: ACCOUNT_TYPES.pointsRevenue,
    normalSide: 'credit',
    assetCode: asset,
    platformId: a.scope.platformId,
    groupId: a.scope.groupId,
    brandId: a.scope.brandId,
  });

  // Convert the hold to a posted spend, then record + credit revenue (balances applied manually).
  const captured = await captureHold(tx, liability.id, a.points);
  if (!captured) throw new LedgerError('insufficient_balance', 'no matching hold to capture');
  await creditAccount(tx, revenue.id, a.points);

  const journalId = await postJournal(tx, {
    ledger: 'points',
    kind: 'redeem_capture',
    occurredAt: a.occurredAt,
    sourceEvent: a.sourceEvent,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    applyBalances: false,
    legs: [
      { accountId: liability.id, normalSide: 'credit', direction: 'debit', amountMinor: a.points, assetCode: asset, pointState: 'redeemed' },
      { accountId: revenue.id, normalSide: 'credit', direction: 'credit', amountMinor: a.points, assetCode: asset },
    ],
  });
  await completeIdempotency(tx, idem.keyId, { journalId });
  return { journalId };
}

export async function voidRedeem(tx: Tx, a: RedeemArgs): Promise<{ journalId: string }> {
  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash(['redeem_void', a.scope.brandId, a.scope.customerId, a.points.toString(), a.sourceEvent]),
    scope: a.scope,
  });
  if (idem.state === 'replay') return idem.response as { journalId: string };

  const asset = pointsAsset(a.scope.brandId);
  const liability = await getOrCreateAccount(tx, {
    ledger: 'points',
    accountType: ACCOUNT_TYPES.pointsLiability,
    normalSide: 'credit',
    assetCode: asset,
    platformId: a.scope.platformId,
    groupId: a.scope.groupId,
    brandId: a.scope.brandId,
    customerId: a.scope.customerId,
  });
  await releasePending(tx, liability.id, a.points);
  const journalId = await postJournal(tx, {
    ledger: 'points',
    kind: 'void',
    occurredAt: a.occurredAt,
    sourceEvent: a.sourceEvent,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs: [],
  });
  await completeIdempotency(tx, idem.keyId, { journalId });
  return { journalId };
}

// ── Wallet: top-up + hybrid drawdown ──────────────────────────────────────────

function walletAccounts(scope: Scope, currency: string) {
  const base = { ledger: 'wallet' as const, assetCode: currency, platformId: scope.platformId, groupId: scope.groupId, brandId: null };
  return {
    liability: { ...base, accountType: ACCOUNT_TYPES.walletLiability, normalSide: 'credit' as const },
    clearing: { ...base, accountType: ACCOUNT_TYPES.cashClearing, normalSide: 'debit' as const },
    cost: { ...base, accountType: ACCOUNT_TYPES.redemptionCost, normalSide: 'credit' as const },
    fee: { ...base, accountType: ACCOUNT_TYPES.platformFee, normalSide: 'credit' as const },
  };
}

export interface TopUpArgs {
  scope: Scope;
  currency: string;
  amountMinor: bigint;
  occurredAt: Date;
  idem: Idem;
}

export async function topUpWallet(tx: Tx, a: TopUpArgs): Promise<{ journalId: string; balance: Balance }> {
  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash(['topup', a.scope.groupId, a.amountMinor.toString()]),
    scope: a.scope,
  });
  const accts = walletAccounts(a.scope, a.currency);
  const liability = await getOrCreateAccount(tx, accts.liability);
  if (idem.state === 'replay') {
    return { journalId: (idem.response as { journalId: string }).journalId, balance: await getBalance(tx, liability.id) };
  }
  const clearing = await getOrCreateAccount(tx, accts.clearing);
  const journalId = await postJournal(tx, {
    ledger: 'wallet',
    kind: 'topup',
    occurredAt: a.occurredAt,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs: [
      { accountId: clearing.id, normalSide: 'debit', direction: 'debit', amountMinor: a.amountMinor, assetCode: a.currency },
      { accountId: liability.id, normalSide: 'credit', direction: 'credit', amountMinor: a.amountMinor, assetCode: a.currency },
    ],
  });
  await completeIdempotency(tx, idem.keyId, { journalId });
  return { journalId, balance: await getBalance(tx, liability.id) };
}

export interface DrawdownArgs {
  scope: Scope;
  currency: string;
  points: bigint;
  costPerPointMinor: bigint;
  platformMarginBps: number;
  occurredAt: Date;
  sourceEvent?: string;
  idem: Idem;
}

export interface DrawdownResult {
  journalId: string;
  costMinor: bigint;
  feeMinor: bigint;
  totalMinor: bigint;
}

export async function drawdownWallet(tx: Tx, a: DrawdownArgs): Promise<DrawdownResult> {
  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash(['drawdown', a.scope.groupId, a.points.toString(), a.sourceEvent]),
    scope: a.scope,
  });
  if (idem.state === 'replay') {
    const r = idem.response as { journalId: string; costMinor: string; feeMinor: string; totalMinor: string };
    return {
      journalId: r.journalId,
      costMinor: BigInt(r.costMinor),
      feeMinor: BigInt(r.feeMinor),
      totalMinor: BigInt(r.totalMinor),
    };
  }

  const costMinor = a.points * a.costPerPointMinor;
  const feeMinor = (costMinor * BigInt(a.platformMarginBps)) / 10000n;
  const totalMinor = costMinor + feeMinor;

  const accts = walletAccounts(a.scope, a.currency);
  const liability = await getOrCreateAccount(tx, accts.liability);
  const cost = await getOrCreateAccount(tx, accts.cost);
  const fee = await getOrCreateAccount(tx, accts.fee);

  const legs: Leg[] = [
    { accountId: liability.id, normalSide: 'credit', direction: 'debit', amountMinor: totalMinor, assetCode: a.currency },
    { accountId: cost.id, normalSide: 'credit', direction: 'credit', amountMinor: costMinor, assetCode: a.currency },
  ];
  if (feeMinor > 0n) {
    legs.push({ accountId: fee.id, normalSide: 'credit', direction: 'credit', amountMinor: feeMinor, assetCode: a.currency });
  }

  const journalId = await postJournal(tx, {
    ledger: 'wallet',
    kind: 'drawdown',
    occurredAt: a.occurredAt,
    sourceEvent: a.sourceEvent,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs,
  });
  await completeIdempotency(tx, idem.keyId, {
    journalId,
    costMinor: costMinor.toString(),
    feeMinor: feeMinor.toString(),
    totalMinor: totalMinor.toString(),
  });
  return { journalId, costMinor, feeMinor, totalMinor };
}
