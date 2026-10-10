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
  /**
   * Points issued in exchange for money, as opposed to given away.
   *
   * Separate from `points_expense` because the two are not the same fact: an
   * earn costs the brand something, a load was paid for. Booking a sold point as
   * an expense would understate what was taken at the counter and overstate
   * what the programme cost, and the outstanding liability — the number that
   * actually matters when a brand holds customers' money as points — would
   * have no way to say how much of it was bought.
   */
  pointsSold: 'points_sold',
  breakageIncome: 'breakage_income',
  walletLiability: 'wallet_liability',
  cashClearing: 'cash_clearing',
  redemptionCost: 'redemption_cost',
  platformFee: 'platform_fee',
} as const;

const hash = (parts: unknown) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/**
 * Checked before the idempotency key is reserved, not after.
 *
 * `postJournal` rejects a non-positive leg too, but by then the key is already
 * written — and a key that exists for a request that never happened will replay
 * a success the next time the till retries it.
 */
function assertPositiveAmount(points: bigint): void {
  if (points <= 0n) throw new LedgerError('invalid_amount', `points must be > 0 (got ${points})`);
}

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
  /** Loyalty type this earn came through: online (web/app) vs in_store (POS terminal). */
  channel?: 'online' | 'in_store' | null;
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
    channel: a.channel ?? null,
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

export interface AdjustArgs {
  scope: BrandCustomerScope;
  /** Positive credits the member; negative debits them. Never zero. */
  points: bigint;
  occurredAt: Date;
  /** Why — a claim id, a support ticket, a correction reference. */
  reason: string;
  idem: Idem;
  expiryBucket?: Date | null;
}

/**
 * A manual correction: points granted (or taken back) outside a sale.
 *
 * Exists for the case a customer notices afterwards that a purchase wasn't
 * credited. `JournalKind.adjust` was in the enum from the start but nothing
 * implemented it, so there was no way to put right a visit the till missed.
 *
 * Deliberately built on the same double-entry legs as an earn rather than a
 * shortcut that writes a balance: an adjustment has to be as traceable as
 * anything else in the ledger, and `reason` rides on the journal so an auditor
 * can see why it happened. A debit clamps to the available balance — a
 * correction must never push someone negative.
 */
export async function adjustPoints(
  tx: Tx,
  a: AdjustArgs,
): Promise<{ journalId: string; balance: Balance; applied: bigint }> {
  if (a.points === 0n) throw new LedgerError('invalid_amount', 'adjustment must be non-zero');

  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash(['adjust', a.scope.brandId, a.scope.customerId, a.points.toString(), a.reason]),
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
    const prior = idem.response as { journalId: string; applied: string };
    return {
      journalId: prior.journalId,
      balance: await getBalance(tx, liability.id),
      applied: BigInt(prior.applied),
    };
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

  const credit = a.points > 0n;
  let amount = credit ? a.points : -a.points;

  if (!credit) {
    // Clawing back more than someone holds would leave a negative balance,
    // which the rest of the system has no way to represent.
    const balance = await getBalance(tx, liability.id);
    if (balance.available <= 0n) {
      await completeIdempotency(tx, idem.keyId, { journalId: '', applied: '0' });
      return { journalId: '', balance, applied: 0n };
    }
    if (amount > balance.available) amount = balance.available;
  }

  const journalId = await postJournal(tx, {
    ledger: 'points',
    kind: 'adjust',
    occurredAt: a.occurredAt,
    sourceEvent: a.reason,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs: credit
      ? [
          { accountId: expense.id, normalSide: 'debit', direction: 'debit', amountMinor: amount, assetCode: asset },
          {
            accountId: liability.id,
            normalSide: 'credit',
            direction: 'credit',
            amountMinor: amount,
            assetCode: asset,
            pointState: 'active',
            expiryBucket: a.expiryBucket ?? null,
          },
        ]
      : [
          {
            accountId: liability.id,
            normalSide: 'credit',
            direction: 'debit',
            amountMinor: amount,
            assetCode: asset,
            pointState: 'adjusted',
          },
          { accountId: expense.id, normalSide: 'debit', direction: 'credit', amountMinor: amount, assetCode: asset },
        ],
  });
  const applied = credit ? amount : -amount;
  await completeIdempotency(tx, idem.keyId, { journalId, applied: applied.toString() });
  return { journalId, balance: await getBalance(tx, liability.id), applied };
}

// ── Points: redeem authorize → capture / void ─────────────────────────────────

export interface RedeemArgs {
  scope: BrandCustomerScope;
  points: bigint;
  occurredAt: Date;
  sourceEvent?: string;
  idem: Idem;
  /** Loyalty type this redemption came through: online (web/app) vs in_store (POS terminal). */
  channel?: 'online' | 'in_store' | null;
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
    channel: a.channel ?? null,
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
    channel: a.channel ?? null,
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
    channel: a.channel ?? null,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs: [],
  });
  await completeIdempotency(tx, idem.keyId, { journalId });
  return { journalId };
}

// ── Membership card: load + spend ─────────────────────────────────────────────
//
// A membership card is not a loyalty card with a bigger balance. On a loyalty
// card points arrive as a thank-you for money spent elsewhere; on a membership
// card the points *are* the money — bought at a counter, handed over at the
// till. That difference is why these are two intents and not two flavours of
// earn and redeem: an earn has no cash behind it to reconcile, and a redemption
// is a reward being claimed rather than a purchase being paid for.
//
// Available to any brand that wants to run one. Nothing here is specific to a
// kind of business: a leisure venue whose stalls are branches, a campus, a
// members' club and a chain selling prepaid credit are the same two movements.
// Both post through the same double-entry engine as everything else, so the
// brand's outstanding liability stays provable from the ledger alone.

export interface LoadArgs {
  scope: BrandCustomerScope;
  points: bigint;
  /**
   * Money taken by the terminal's own payment flow, in minor units. Recorded
   * because whoever sold them reconciles against the till at close: the ledger
   * knows how many points went out, and this is what came in for them.
   */
  amountPaidMinor: bigint;
  occurredAt: Date;
  sourceEvent?: string;
  idem: Idem;
  expiryBucket?: Date | null;
  channel?: 'online' | 'in_store' | null;
}

/**
 * Staff sell points to a member.
 *
 * Credits the member and debits `points_sold` rather than `points_expense` —
 * these points were bought, not given, and the two must not add up together.
 * Subject to expiry like any other points: the sweep reads `expiry_bucket` on
 * the credit leg and neither knows nor cares which intent wrote it.
 */
export async function loadPoints(
  tx: Tx,
  a: LoadArgs,
): Promise<{ journalId: string; balance: Balance }> {
  assertPositiveAmount(a.points);
  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash([
      'load',
      a.scope.brandId,
      a.scope.customerId,
      a.points.toString(),
      a.amountPaidMinor.toString(),
      a.sourceEvent,
    ]),
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
    return {
      journalId: (idem.response as { journalId: string }).journalId,
      balance: await getBalance(tx, liability.id),
    };
  }
  const sold = await getOrCreateAccount(tx, {
    ledger: 'points',
    accountType: ACCOUNT_TYPES.pointsSold,
    normalSide: 'debit',
    assetCode: asset,
    platformId: a.scope.platformId,
    groupId: a.scope.groupId,
    brandId: a.scope.brandId,
  });

  const journalId = await postJournal(tx, {
    ledger: 'points',
    kind: 'load',
    occurredAt: a.occurredAt,
    sourceEvent: a.sourceEvent,
    channel: a.channel ?? null,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs: [
      { accountId: sold.id, normalSide: 'debit', direction: 'debit', amountMinor: a.points, assetCode: asset },
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
  await completeIdempotency(tx, idem.keyId, {
    journalId,
    amountPaidMinor: a.amountPaidMinor.toString(),
  });
  return { journalId, balance: await getBalance(tx, liability.id) };
}

export interface SpendArgs {
  scope: BrandCustomerScope;
  points: bigint;
  occurredAt: Date;
  sourceEvent?: string;
  idem: Idem;
  channel?: 'online' | 'in_store' | null;
}

/**
 * A branch charges a member's points as payment.
 *
 * Single-step: there is no authorize/capture pair because there is nothing to
 * hold — the customer is standing at the till and the transaction is over
 * before they walk away. The overdraw guard in `applyPosted` is what makes
 * "fails when the balance is short" true rather than hoped for; no branch can
 * push a member negative, however many devices charge at once.
 *
 * Earning back on the spend is deliberately *not* done here. What a spend earns
 * is a question for the brand's earn rules, which live a layer up — the caller
 * posts an `earnPoints` alongside this in the same transaction, so the debit and
 * the credit it produces either both happen or neither does.
 */
export async function spendPoints(
  tx: Tx,
  a: SpendArgs,
): Promise<{ journalId: string; balance: Balance }> {
  assertPositiveAmount(a.points);
  const idem = await reserveIdempotency(tx, {
    ...a.idem,
    requestHash: hash(['spend', a.scope.brandId, a.scope.customerId, a.points.toString(), a.sourceEvent]),
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
    return {
      journalId: (idem.response as { journalId: string }).journalId,
      balance: await getBalance(tx, liability.id),
    };
  }
  const revenue = await getOrCreateAccount(tx, {
    ledger: 'points',
    accountType: ACCOUNT_TYPES.pointsRevenue,
    normalSide: 'credit',
    assetCode: asset,
    platformId: a.scope.platformId,
    groupId: a.scope.groupId,
    brandId: a.scope.brandId,
  });

  const journalId = await postJournal(tx, {
    ledger: 'points',
    kind: 'spend',
    occurredAt: a.occurredAt,
    sourceEvent: a.sourceEvent,
    channel: a.channel ?? null,
    scope: a.scope,
    idempotencyKeyId: idem.keyId,
    legs: [
      {
        accountId: liability.id,
        normalSide: 'credit',
        direction: 'debit',
        amountMinor: a.points,
        assetCode: asset,
        pointState: 'redeemed',
      },
      { accountId: revenue.id, normalSide: 'credit', direction: 'credit', amountMinor: a.points, assetCode: asset },
    ],
  });
  await completeIdempotency(tx, idem.keyId, { journalId });
  return { journalId, balance: await getBalance(tx, liability.id) };
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
