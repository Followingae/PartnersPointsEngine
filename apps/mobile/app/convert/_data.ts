/**
 * Shared loading and derived values for the Lulu conversion flow.
 *
 * `previewConvert` answers with either a brand's full terms or a bare "not
 * enabled", so every screen needs both: the raw preview to say why it can't
 * convert, and the narrowed terms to quote a rate. Both are resolved here once
 * rather than re-narrowed at each render site.
 */
import {
  Card,
  Conversion,
  ConversionPreview,
  ConversionTerms,
  conversionTerms,
  getCards,
  getConversions,
  previewConvert,
} from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

/** A transfer plus the card it came out of — history is merged across cards. */
export interface ConversionRow extends Conversion {
  brandName: string;
}

export interface ConvertData {
  cards: Card[];
  card?: Card;
  preview?: ConversionPreview;
  terms?: ConversionTerms;
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
    const preview = await previewConvert(card.brandId, 1);
    return { cards, card, preview, terms: conversionTerms(preview) };
  }, [brandId]);
}

/**
 * The binding quote for one exact amount. The picker's arithmetic is a
 * convenience; this is the number the customer confirms and the server honours.
 */
export function useQuote(brandId: string | undefined, sourcePoints: number) {
  return useAsync<Omit<ConvertData, 'cards'>>(async () => {
    const cards = await getCards();
    const card = cards.find((c) => c.brandId === brandId) ?? cards[0];
    if (!card) return {};
    const preview = await previewConvert(card.brandId, sourcePoints);
    return { card, preview, terms: conversionTerms(preview) };
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
        const rows = await getConversions(c.brandId);
        return rows.map((r) => ({ ...r, brandName: c.brandName }));
      }),
    );
    return results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }, []);
}

/** The partner's name for its own currency — "Lulu Happiness Points". */
export const partnerCurrency = (t: ConversionTerms | undefined) =>
  t?.partner.currencyName ?? 'Lulu Happiness Points';

/** The server's rounding, mirrored so the picker can move without a round trip. */
export const partnerPointsFor = (sourcePoints: number, ratioBps: number | undefined) =>
  ratioBps ? Math.floor((sourcePoints * ratioBps) / 10000) : 0;

/** How many of the customer's points buy one partner point, or null if unknown. */
export const pointsPerPartnerPoint = (ratioBps: number | undefined): number | null =>
  ratioBps ? 10000 / ratioBps : null;

/** "5 : 1" — the rate, as the confirm screens state it. */
export function rateLabel(ratioBps: number | undefined): string {
  const per = pointsPerPartnerPoint(ratioBps);
  return per === null ? '—' : `${per.toLocaleString('en-US', { maximumFractionDigits: 2 })} : 1`;
}

/**
 * The picker's first stop, and the size of every step after it.
 *
 * The merchant's own minimum is the floor, so no stop on the picker is an amount
 * the server would reject. Merchants may set none — the column defaults to 0 —
 * and a zero step would divide by nothing, so 100 stands in for them.
 */
export const stepFor = (t: ConversionTerms | undefined): number =>
  t && t.minConversion > 0 ? t.minConversion : 100;

/** Why this card can't convert right now, or null when it can. */
export function blockedReason(p: ConversionPreview | undefined): string | null {
  if (!p) return null;
  if (!p.partner) return 'This brand does not convert points to a partner programme yet.';
  if (!p.available) return 'Conversions are paused for this brand right now.';
  if (!p.allowanceAvailable) {
    return 'This brand’s conversion allowance is empty right now. Try again later.';
  }
  return null;
}
