/**
 * A customer's activity is two stories told by two tables, and neither one is
 * complete on its own.
 *
 * The ledger records points moving — earn, redeem, expiry, adjustment. But a
 * voucher's life leaves almost no trace there: redeeming one is a status update
 * (the points were already burned when it was issued), and a voucher gifted by
 * superadmin costs zero points, so it never touches the ledger at all. Read the
 * ledger alone and rewards appear to be issued from nowhere and used never.
 *
 * So the feed is a merge. Ledger journals supply the points movements; the
 * voucher table's own timestamps (created / redeemed / expired) supply the
 * reward events. Where the two describe the same moment — the redeem_capture
 * that paid for a voucher — they collapse into one row carrying the reward's
 * name, rather than a bare "redeem capture" the reader has to decode.
 *
 * Deriving reward events from voucher timestamps rather than a new event log
 * means the history is correct for vouchers issued before this existed.
 */

export type CustomerActivityType =
  | 'earn'
  | 'redeem'
  | 'expiry'
  | 'adjust'
  | 'void'
  | 'reverse'
  | 'transfer'
  | 'voucher_issued'
  | 'voucher_redeemed'
  | 'voucher_expired';

export interface CustomerActivityEvent {
  id: string;
  at: Date;
  type: CustomerActivityType;
  /** Human label, ready to render — no enum decoding in the client. */
  title: string;
  /** Signed points, e.g. "+120" / "−500". Null when the event moves no points. */
  points: string | null;
  direction: 'credit' | 'debit' | null;
  rewardName: string | null;
  voucherCode: string | null;
  brandId: string | null;
  brandName: string | null;
}

export interface ActivityJournalRow {
  id: string;
  kind: string;
  direction: string;
  amountMinor: bigint;
  occurredAt: Date;
  brandId?: string | null;
  brandName?: string | null;
}

export interface ActivityVoucherRow {
  id: string;
  code: string;
  status: string;
  createdAt: Date;
  redeemedAt: Date | null;
  expiresAt: Date | null;
  pointsSpent: bigint;
  redeemJournalId: string | null;
  rewardName: string | null;
  brandId?: string | null;
  brandName?: string | null;
}

const JOURNAL_TITLES: Record<string, string> = {
  earn: 'Points earned',
  redeem_auth: 'Redemption held',
  redeem_capture: 'Points redeemed',
  void: 'Redemption released',
  reverse: 'Transaction reversed',
  expiry: 'Points expired',
  adjust: 'Manual adjustment',
  topup: 'Points added',
  drawdown: 'Points removed',
  fee: 'Fee',
};

const JOURNAL_TYPES: Record<string, CustomerActivityType> = {
  earn: 'earn',
  redeem_auth: 'redeem',
  redeem_capture: 'redeem',
  void: 'void',
  reverse: 'reverse',
  expiry: 'expiry',
  adjust: 'adjust',
  topup: 'adjust',
  drawdown: 'adjust',
  fee: 'adjust',
};

/** Signed points with a true minus sign, matching how the consoles render amounts. */
function signed(amount: bigint, direction: string): string {
  const n = amount < 0n ? -amount : amount;
  return `${direction === 'credit' ? '+' : '−'}${n.toString()}`;
}

export function buildCustomerActivity(input: {
  journals: ActivityJournalRow[];
  vouchers: ActivityVoucherRow[];
  limit?: number;
}): CustomerActivityEvent[] {
  const { journals, vouchers, limit = 50 } = input;

  // A voucher bought with points shares its moment with the redeem_capture that
  // paid for it — look it up so that row can name the reward.
  const voucherByJournal = new Map<string, ActivityVoucherRow>();
  for (const v of vouchers) {
    if (v.redeemJournalId) voucherByJournal.set(v.redeemJournalId, v);
  }

  const events: CustomerActivityEvent[] = [];

  for (const j of journals) {
    const paidFor = voucherByJournal.get(j.id);
    const base = JOURNAL_TITLES[j.kind] ?? j.kind.replace(/_/g, ' ');
    events.push({
      id: `j:${j.id}`,
      at: j.occurredAt,
      type: JOURNAL_TYPES[j.kind] ?? 'adjust',
      title: paidFor?.rewardName ? `Reward claimed — ${paidFor.rewardName}` : base,
      points: signed(j.amountMinor, j.direction),
      direction: j.direction === 'credit' ? 'credit' : 'debit',
      rewardName: paidFor?.rewardName ?? null,
      voucherCode: paidFor?.code ?? null,
      brandId: j.brandId ?? null,
      brandName: j.brandName ?? null,
    });
  }

  for (const v of vouchers) {
    const reward = v.rewardName ?? 'Reward';
    // Skip the issue event when a ledger row already tells that story, or the
    // reader sees the same moment twice.
    if (!v.redeemJournalId) {
      events.push({
        id: `v:${v.id}:issued`,
        at: v.createdAt,
        type: 'voucher_issued',
        title: v.pointsSpent > 0n ? `Reward claimed — ${reward}` : `Reward gifted — ${reward}`,
        points: v.pointsSpent > 0n ? signed(v.pointsSpent, 'debit') : null,
        direction: v.pointsSpent > 0n ? 'debit' : null,
        rewardName: reward,
        voucherCode: v.code,
        brandId: v.brandId ?? null,
        brandName: v.brandName ?? null,
      });
    }

    if (v.status === 'redeemed' && v.redeemedAt) {
      events.push({
        id: `v:${v.id}:redeemed`,
        at: v.redeemedAt,
        type: 'voucher_redeemed',
        title: `Reward used — ${reward}`,
        points: null,
        direction: null,
        rewardName: reward,
        voucherCode: v.code,
        brandId: v.brandId ?? null,
        brandName: v.brandName ?? null,
      });
    }

    if (v.status === 'expired' && v.expiresAt) {
      events.push({
        id: `v:${v.id}:expired`,
        at: v.expiresAt,
        type: 'voucher_expired',
        title: `Reward expired — ${reward}`,
        points: null,
        direction: null,
        rewardName: reward,
        voucherCode: v.code,
        brandId: v.brandId ?? null,
        brandName: v.brandName ?? null,
      });
    }
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events.slice(0, limit);
}
