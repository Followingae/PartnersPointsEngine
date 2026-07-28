/**
 * Shared loading and shapes for the Lulu conversion flow.
 *
 * Two things are worked around here rather than in every screen:
 *
 *  · `ConversionPreview` in `lib/api.ts` describes fewer fields than the API
 *    actually returns, and its `sourcePoints`/`partnerPoints` are absent when a
 *    merchant has no partner deal switched on. `Preview` below is the full
 *    server shape; the client type is assignable to it, so nothing is cast.
 *  · `getConversions` is typed `unknown[]`. The row shape is asserted once, in
 *    `useConversions`, instead of at every render site.
 */
import { Card, ConversionPreview, getCards, getConversions, previewConvert } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

/** What `POST /customer/partners/preview` really returns. */
export type Preview = Omit<ConversionPreview, 'sourcePoints' | 'partnerPoints'> & {
  sourcePoints?: number;
  partnerPoints?: number;
  /** False when this brand has no partner conversion switched on at all. */
  available?: boolean;
  /** False until the customer has linked their partner account. */
  linked?: boolean;
  /** Smallest transfer the merchant allows. */
  minConversion?: number;
  /** False when the merchant's prepaid allowance is exhausted. */
  allowanceAvailable?: boolean;
  partner?: { key: string; currencyName: string };
};

export interface ConversionRow {
  id: string;
  sourcePoints: string;
  partnerPoints: string;
  /** `pending` · `completed` · `failed`. */
  status: string;
  partnerTxnRef: string | null;
  createdAt: string;
  /** Filled in by `useConversions` — the endpoint is already brand-scoped. */
  brandName?: string;
}

export interface ConvertData {
  cards: Card[];
  card?: Card;
  preview?: Preview;
}

/**
 * The wallet plus one brand's conversion terms.
 *
 * The probe asks for a single point: the rate, the minimum and the link state
 * are all the caller needs to build the picker, and the minimum can't be used to
 * size the probe because the probe is what reveals it.
 */
export function useConvert(brandId?: string) {
  return useAsync<ConvertData>(async () => {
    const cards = await getCards();
    const card = cards.find((c) => c.brandId === brandId) ?? cards[0];
    if (!card) return { cards };
    return { cards, card, preview: await previewConvert(card.brandId, 1) };
  }, [brandId]);
}

/**
 * The binding quote for one exact amount. The picker's arithmetic is a
 * convenience; this is the number the customer confirms and the server honours.
 */
export function useQuote(brandId: string | undefined, sourcePoints: number) {
  return useAsync<{ card?: Card; preview?: Preview }>(async () => {
    const cards = await getCards();
    const card = cards.find((c) => c.brandId === brandId) ?? cards[0];
    if (!card) return {};
    return { card, preview: await previewConvert(card.brandId, sourcePoints) };
  }, [brandId, sourcePoints]);
}

/**
 * Every transfer the customer has made, newest first.
 *
 * History is a per-brand endpoint but the customer thinks of it as one list, so
 * the cards are queried in parallel and merged. One card failing loses that
 * card's rows, not the screen.
 */
export function useConversions() {
  return useAsync<ConversionRow[]>(async () => {
    const cards = await getCards();
    const results = await Promise.allSettled(
      cards.map(async (c) => {
        const rows = (await getConversions(c.brandId)) as ConversionRow[];
        return rows.map((r) => ({ ...r, brandName: c.brandName }));
      }),
    );
    return results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }, []);
}

/** The partner's name for its own currency — "Lulu Happiness Points". */
export const partnerCurrency = (p: Preview | undefined) =>
  p?.partner?.currencyName ?? 'Lulu Happiness Points';

/** The server's rounding, mirrored so the picker can move without a round trip. */
export const partnerPointsFor = (sourcePoints: number, ratioBps: number | undefined) =>
  ratioBps ? Math.floor((sourcePoints * ratioBps) / 10000) : 0;

/** "5 : 1" — how many of the customer's points buy one partner point. */
export function rateLabel(ratioBps: number | undefined): string {
  if (!ratioBps) return '—';
  const perPartnerPoint = 10000 / ratioBps;
  return `${perPartnerPoint.toLocaleString('en-US', { maximumFractionDigits: 2 })} : 1`;
}

/** Why this card can't convert right now, or null when it can. */
export function blockedReason(p: Preview | undefined): string | null {
  if (!p) return null;
  if (p.available === false) {
    return p.reason === 'not_enabled'
      ? 'This brand does not convert points to a partner programme yet.'
      : 'Conversions are paused for this brand right now.';
  }
  if (p.allowanceAvailable === false) {
    return 'This brand’s conversion allowance is empty right now. Try again later.';
  }
  return null;
}
