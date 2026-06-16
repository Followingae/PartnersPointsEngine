/**
 * Money & points are ALWAYS integers — never floats.
 *  - Money: integer minor units (e.g. fils/cents) paired with an ISO-4217 code.
 *  - Points: whole integers, paired with a brand-scoped asset code `PTS:<brandId>`.
 */

/** Build the brand-scoped points asset code used on ledger accounts/entries. */
export function pointsAsset(brandId: string): string {
  return `PTS:${brandId}`;
}

export interface MoneyMinor {
  /** Integer minor units (bigint-safe; use string at the wire boundary for very large values). */
  amountMinor: number;
  currency: string; // ISO-4217, e.g. 'AED'
}

export interface PointsAmount {
  points: number; // whole integer
  asset: string; // 'PTS:<brandId>'
}

/** Guard: throws if a value is not a safe non-negative integer (use for amounts). */
export function assertNonNegativeInt(value: number, label = 'amount'): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (got ${value})`);
  }
}
