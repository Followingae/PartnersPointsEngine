/**
 * The Activity tab's filter state.
 *
 * The filter sheet is a route of its own, so the choice has to survive the trip
 * back to the tab. This is that shared state — a tiny external store rather
 * than navigation params, because the sheet sits *on top of* the tab and never
 * re-mounts it.
 *
 * Filtering happens on the page already fetched: `GET /customer/wallet/activity`
 * takes no filter arguments, so narrowing client-side is honest about what the
 * user is looking at (their most recent events) instead of implying a search.
 */
import { useSyncExternalStore } from 'react';
import type { ActivityEvent, ActivityType } from '@/lib/api';

export type TypeKey = 'all' | 'earn' | 'redeem' | 'voucher' | 'expiry' | 'adjust';
export type DirectionKey = 'all' | 'credit' | 'debit';

export interface ActivityFilters {
  type: TypeKey;
  /** null means every card. */
  brandId: string | null;
  direction: DirectionKey;
}

export interface BrandOption {
  id: string;
  name: string;
}

export const NO_FILTERS: ActivityFilters = { type: 'all', brandId: null, direction: 'all' };

export const TYPE_OPTIONS: { key: TypeKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'earn', label: 'Earned' },
  { key: 'redeem', label: 'Redeemed' },
  { key: 'voucher', label: 'Rewards' },
  { key: 'expiry', label: 'Expired' },
  { key: 'adjust', label: 'Adjusted' },
];

export const DIRECTION_OPTIONS: { key: DirectionKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'credit', label: 'Points in' },
  { key: 'debit', label: 'Points out' },
];

/** Which event types each chip stands for. */
const TYPES_IN: Record<Exclude<TypeKey, 'all'>, ActivityType[]> = {
  earn: ['earn'],
  redeem: ['redeem'],
  voucher: ['voucher_issued', 'voucher_redeemed', 'voucher_expired'],
  expiry: ['expiry'],
  adjust: ['adjust', 'void', 'reverse', 'transfer'],
};

/** Reward events read differently from points events, so screens mark them out. */
export const isVoucherEvent = (e: ActivityEvent) => TYPES_IN.voucher.includes(e.type);

export const hasFilters = (f: ActivityFilters) =>
  f.type !== 'all' || f.direction !== 'all' || f.brandId !== null;

export function applyFilters(events: ActivityEvent[], f: ActivityFilters): ActivityEvent[] {
  if (!hasFilters(f)) return events;
  return events.filter(
    (e) =>
      (f.type === 'all' || TYPES_IN[f.type].includes(e.type)) &&
      (f.direction === 'all' || e.direction === f.direction) &&
      (f.brandId === null || e.brandId === f.brandId),
  );
}

/** The cards the feed actually mentions, in the order they first appear. */
export function brandOptionsFrom(events: ActivityEvent[]): BrandOption[] {
  const out: BrandOption[] = [];
  for (const e of events) {
    if (e.brandId && e.brandName && !out.some((b) => b.id === e.brandId)) {
      out.push({ id: e.brandId, name: e.brandName });
    }
  }
  return out;
}

// ── store ──────────────────────────────────────────────────────────────────

let filters: ActivityFilters = NO_FILTERS;
let brands: BrandOption[] = [];

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const setFilters = (next: ActivityFilters) => {
  filters = next;
  emit();
};

export const clearFilters = () => setFilters(NO_FILTERS);

/**
 * The Activity tab publishes the cards it loaded, so the sheet can offer real
 * ones. A card that has dropped out of the feed can't stay selected, or the
 * list would filter down to nothing with no way to see why.
 */
export function publishBrands(next: BrandOption[]): void {
  const same = next.length === brands.length && next.every((b, i) => brands[i]!.id === b.id);
  if (same) return;
  brands = next;
  if (filters.brandId && !next.some((b) => b.id === filters.brandId)) {
    filters = { ...filters, brandId: null };
  }
  emit();
}

const readFilters = () => filters;
const readBrands = () => brands;

export const useActivityFilters = () => useSyncExternalStore(subscribe, readFilters, readFilters);
export const useBrandOptions = () => useSyncExternalStore(subscribe, readBrands, readBrands);
