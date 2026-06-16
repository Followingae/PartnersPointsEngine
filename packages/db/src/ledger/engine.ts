/**
 * Double-entry ledger engine (Phase 2) — framework-agnostic.
 *
 * Every function operates inside a caller-provided transaction (`Prisma.TransactionClient`)
 * so the caller controls isolation and (in the API) the RLS tenant context. Money &
 * points are bigint (integer minor units / whole points). Correctness is layered:
 *   1) idempotency keys (replay-safe),
 *   2) guarded conditional balance updates (no overdraw, race-safe on a single row),
 *   3) DB constraints (balanced-journal trigger + non-negative CHECK) as backstops.
 */
import type { Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;
export type NormalSide = 'debit' | 'credit';
export type Direction = 'debit' | 'credit';
export type LedgerName = 'points' | 'wallet';

export class LedgerError extends Error {
  constructor(
    public readonly code:
      | 'insufficient_balance'
      | 'idempotency_conflict'
      | 'unbalanced'
      | 'invalid_amount',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LedgerError';
  }
}

export const pointsAsset = (brandId: string): string => `PTS:${brandId}`;

export interface Scope {
  platformId: string;
  groupId: string;
  brandId?: string | null;
  branchId?: string | null;
}

export interface AccountSpec {
  ledger: LedgerName;
  accountType: string;
  normalSide: NormalSide;
  assetCode: string;
  platformId: string;
  groupId: string;
  brandId?: string | null;
  customerId?: string | null;
}

interface AccountRow {
  id: string;
  normalSide: NormalSide;
}

export interface Leg {
  accountId: string;
  normalSide: NormalSide;
  direction: Direction;
  amountMinor: bigint;
  assetCode: string;
  pointState?: 'pending' | 'active' | 'redeemed' | 'expired' | 'reversed' | 'adjusted';
  expiryBucket?: Date | null;
}

function assertPositive(amount: bigint): void {
  if (amount <= 0n) throw new LedgerError('invalid_amount', `amount must be > 0 (got ${amount})`);
}

// ── Accounts ───────────────────────────────────────────────────────────────

export async function getOrCreateAccount(tx: Tx, spec: AccountSpec): Promise<AccountRow> {
  const find = () =>
    tx.ledgerAccount.findFirst({
      where: {
        ledger: spec.ledger,
        accountType: spec.accountType,
        assetCode: spec.assetCode,
        groupId: spec.groupId,
        brandId: spec.brandId ?? null,
        customerId: spec.customerId ?? null,
      },
      select: { id: true, normalSide: true },
    });

  const existing = await find();
  if (existing) return existing as AccountRow;

  try {
    const acc = await tx.ledgerAccount.create({
      data: {
        ledger: spec.ledger,
        accountType: spec.accountType,
        normalSide: spec.normalSide,
        assetCode: spec.assetCode,
        platformId: spec.platformId,
        groupId: spec.groupId,
        brandId: spec.brandId ?? null,
        customerId: spec.customerId ?? null,
      },
      select: { id: true, normalSide: true },
    });
    await tx.accountBalance.create({
      data: {
        accountId: acc.id,
        normalSide: spec.normalSide,
        platformId: spec.platformId,
        groupId: spec.groupId,
        brandId: spec.brandId ?? null,
      },
    });
    return acc as AccountRow;
  } catch (err) {
    // Lost a create race against the unique identity index — re-read.
    const again = await find();
    if (again) return again as AccountRow;
    throw err;
  }
}

// ── Balance mutation primitives (guarded) ────────────────────────────────────

/** Apply a posted leg. Debiting a credit-normal account is guarded against overdraw. */
async function applyPosted(tx: Tx, leg: Leg): Promise<void> {
  const guardOverdraw = leg.normalSide === 'credit' && leg.direction === 'debit';
  if (guardOverdraw) {
    const n = await tx.$executeRaw`
      UPDATE account_balance
         SET posted_debits = posted_debits + ${leg.amountMinor}::bigint,
             lock_version = lock_version + 1,
             updated_at = now()
       WHERE account_id = ${leg.accountId}
         AND (posted_credits - posted_debits - pending_debits) >= ${leg.amountMinor}::bigint`;
    if (n === 0) throw new LedgerError('insufficient_balance');
    return;
  }
  const column = leg.direction === 'debit' ? 'posted_debits' : 'posted_credits';
  await tx.$executeRawUnsafe(
    `UPDATE account_balance SET ${column} = ${column} + $1::bigint, lock_version = lock_version + 1, updated_at = now() WHERE account_id = $2`,
    leg.amountMinor,
    leg.accountId,
  );
}

/** Place a hold (pending debit) on a credit-normal account; false if it would overdraw. */
export async function holdPending(tx: Tx, accountId: string, amount: bigint): Promise<boolean> {
  assertPositive(amount);
  const n = await tx.$executeRaw`
    UPDATE account_balance
       SET pending_debits = pending_debits + ${amount}::bigint,
           lock_version = lock_version + 1,
           updated_at = now()
     WHERE account_id = ${accountId}
       AND (posted_credits - posted_debits - pending_debits) >= ${amount}::bigint`;
  return n > 0;
}

export async function releasePending(tx: Tx, accountId: string, amount: bigint): Promise<void> {
  await tx.$executeRaw`
    UPDATE account_balance
       SET pending_debits = pending_debits - ${amount}::bigint,
           lock_version = lock_version + 1,
           updated_at = now()
     WHERE account_id = ${accountId}`;
}

export interface Balance {
  posted: bigint;
  pending: bigint;
  available: bigint;
}

export async function getBalance(tx: Tx, accountId: string): Promise<Balance> {
  const rows = await tx.$queryRaw<
    { available: bigint; posted: bigint; pending: bigint }[]
  >`
    SELECT (posted_credits - posted_debits) AS posted,
           pending_debits AS pending,
           (posted_credits - posted_debits - pending_debits) AS available
      FROM account_balance WHERE account_id = ${accountId}`;
  const r = rows[0];
  if (!r) return { posted: 0n, pending: 0n, available: 0n };
  return { posted: BigInt(r.posted), pending: BigInt(r.pending), available: BigInt(r.available) };
}

// ── Journals ─────────────────────────────────────────────────────────────────

interface PostArgs {
  ledger: LedgerName;
  kind: string;
  occurredAt: Date;
  sourceEvent?: string | null;
  reversesId?: string | null;
  scope: Scope;
  idempotencyKeyId?: string | null;
  legs: Leg[];
  /** When false, entries are recorded but balances are mutated by the caller. */
  applyBalances?: boolean;
}

/** Insert a journal + its entries and (by default) apply posted balances. The DB trigger enforces Σ=0. */
export async function postJournal(tx: Tx, args: PostArgs): Promise<string> {
  for (const leg of args.legs) assertPositive(leg.amountMinor);
  const applyBalances = args.applyBalances ?? true;

  const journal = await tx.journal.create({
    data: {
      ledger: args.ledger,
      kind: args.kind as Prisma.JournalCreateInput['kind'],
      occurredAt: args.occurredAt,
      sourceEvent: args.sourceEvent ?? null,
      reversesId: args.reversesId ?? null,
      platformId: args.scope.platformId,
      groupId: args.scope.groupId,
      brandId: args.scope.brandId ?? null,
      branchId: args.scope.branchId ?? null,
      idempotencyKeyId: args.idempotencyKeyId ?? null,
    },
    select: { id: true },
  });

  for (const leg of args.legs) {
    await tx.entry.create({
      data: {
        journalId: journal.id,
        accountId: leg.accountId,
        direction: leg.direction,
        amountMinor: leg.amountMinor,
        assetCode: leg.assetCode,
        pointState: leg.pointState ?? null,
        expiryBucket: leg.expiryBucket ?? null,
        platformId: args.scope.platformId,
        groupId: args.scope.groupId,
        brandId: args.scope.brandId ?? null,
      },
    });
    if (applyBalances) await applyPosted(tx, leg);
  }
  return journal.id;
}

/** Atomically convert a hold into a posted spend on a credit-normal account. */
export async function captureHold(tx: Tx, accountId: string, amount: bigint): Promise<boolean> {
  assertPositive(amount);
  const n = await tx.$executeRaw`
    UPDATE account_balance
       SET pending_debits = pending_debits - ${amount}::bigint,
           posted_debits = posted_debits + ${amount}::bigint,
           lock_version = lock_version + 1,
           updated_at = now()
     WHERE account_id = ${accountId} AND pending_debits >= ${amount}::bigint`;
  return n > 0;
}

/** Apply a single posted credit/debit to an account balance (unguarded). */
export async function creditAccount(tx: Tx, accountId: string, amount: bigint): Promise<void> {
  assertPositive(amount);
  await tx.$executeRaw`
    UPDATE account_balance
       SET posted_credits = posted_credits + ${amount}::bigint,
           lock_version = lock_version + 1,
           updated_at = now()
     WHERE account_id = ${accountId}`;
}

// ── Idempotency ──────────────────────────────────────────────────────────────

export interface IdempotencyResult {
  state: 'new' | 'replay';
  keyId: string;
  response?: unknown;
}

/** Reserve an idempotency key. On replay with a matching request, returns the stored response. */
export async function reserveIdempotency(
  tx: Tx,
  args: { actorId: string; key: string; requestHash: string; scope: Scope },
): Promise<IdempotencyResult> {
  const existing = await tx.idempotencyKey.findUnique({
    where: { actorId_key: { actorId: args.actorId, key: args.key } },
  });
  if (existing) {
    if (existing.requestHash !== args.requestHash) {
      throw new LedgerError('idempotency_conflict', 'key reused with a different request');
    }
    return { state: 'replay', keyId: existing.id, response: existing.response ?? undefined };
  }
  const created = await tx.idempotencyKey.create({
    data: {
      actorId: args.actorId,
      key: args.key,
      requestHash: args.requestHash,
      status: 'processing',
      platformId: args.scope.platformId,
      groupId: args.scope.groupId ?? null,
      brandId: args.scope.brandId ?? null,
    },
    select: { id: true },
  });
  return { state: 'new', keyId: created.id };
}

export async function completeIdempotency(tx: Tx, keyId: string, response: unknown): Promise<void> {
  await tx.idempotencyKey.update({
    where: { id: keyId },
    data: { status: 'done', response: response as Prisma.InputJsonValue },
  });
}
