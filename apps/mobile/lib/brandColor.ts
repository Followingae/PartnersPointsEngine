/**
 * A colour per brand.
 *
 * Brands that have set `branding.primaryColor` get their own; the rest get a
 * stable pick from the palette, hashed from the brand id so the same card wears
 * the same swatch on every screen and across launches. Activity events carry no
 * branding at all, which is why the hash takes only an id.
 */
import { C } from '@/lib/tokens';

const PALETTE = [C.orange, C.purple, C.green, C.blue, C.pink, C.electric, C.amber, C.slate];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function brandColor(
  brandId: string | null | undefined,
  branding?: Record<string, unknown> | null,
): string {
  const declared = branding?.primaryColor;
  if (typeof declared === 'string' && HEX.test(declared)) return declared;
  if (!brandId) return C.ink;
  let h = 0;
  for (let i = 0; i < brandId.length; i++) h = (h * 31 + brandId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** The same hue at icon-tile strength. */
export function brandTint(color: string, alpha = 0.12): string {
  if (!HEX.test(color)) return C.wash;
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Ink or white, whichever survives on top of `color` — a brand strip has to
 * stay legible whether the brand picked lime or navy.
 */
export function readableOn(color: string): string {
  if (!HEX.test(color)) return C.ink;
  const n = parseInt(color.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? C.ink : '#FFFFFF';
}
