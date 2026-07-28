/**
 * Shared loading for the rewards flow.
 *
 * A reward belongs to one brand, so every screen here needs the card the points
 * are being spent from as well as the catalogue. Both come from a single loader
 * so the cost, the balance and the "can I afford this" test are always read from
 * the same snapshot — a stale balance on a confirm screen is a wrong answer, not
 * a slow one.
 */
import { Card, Reward, getCards, getRewards } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

export interface RewardsData {
  /** Every card in the wallet — what the brand picker offers. */
  cards: Card[];
  /** The card being spent from; undefined only when the wallet is empty. */
  card?: Card;
  rewards: Reward[];
}

/**
 * The catalogue for one brand. `brandId` is optional so the screens can be
 * opened from anywhere; without one the first card in the wallet is used and
 * the customer can switch.
 */
export function useRewards(brandId?: string) {
  return useAsync<RewardsData>(async () => {
    const cards = await getCards();
    const card = cards.find((c) => c.brandId === brandId) ?? cards[0];
    if (!card) return { cards, rewards: [] };
    return { cards, card, rewards: await getRewards(card.brandId) };
  }, [brandId]);
}

/** Points arrive as decimal strings — never compare them as text. */
export const cost = (r: Reward) => Number(r.pointsCost);
export const balance = (c: Card | undefined) => Number(c?.available ?? 0);

export const affords = (c: Card | undefined, r: Reward) => balance(c) >= cost(r);

/** How far short the balance is. Zero or less means it is covered. */
export const shortfall = (c: Card | undefined, r: Reward) => cost(r) - balance(c);
