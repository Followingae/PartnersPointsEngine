/**
 * Turning an API brand into something drawable.
 *
 * The API hands back `branding` as free-form JSON — the merchant console only
 * guarantees `primaryColor`, and plenty of brands have never set one. So both
 * the fill and the initials are derived here rather than at each call site,
 * and a brand with no colour still gets a stable one instead of a grey hole.
 */
import { C } from '@/lib/tokens';

/** Fills used when a brand has published no colour of its own. */
const FALLBACK = [C.orange, C.blue, C.pink, C.green, C.purple, C.lime];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Stable per-brand index, so the same brand keeps the same colour between runs. */
function hash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function brandColor(branding: Record<string, unknown> | null | undefined, key: string): string {
  const raw = branding?.primaryColor ?? branding?.color;
  if (typeof raw === 'string' && HEX.test(raw.trim())) return raw.trim();
  return FALLBACK[hash(key) % FALLBACK.length]!;
}

/**
 * One or two letters for the brand badge: the initials of the first two words,
 * or the first two letters of a single-word name.
 */
export function brandInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Initials for a person — one letter per name, two at most. */
export function personInitials(name: string | null | undefined): string | null {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) return words[0]![0]!.toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}
