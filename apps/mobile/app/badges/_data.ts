/**
 * Presentation for the badge wall.
 *
 * The API returns awards only — `GET /customer/badges` lists what a member has
 * actually earned for one brand, with no catalogue of the locked ones and no
 * colour of its own. So the tile fill is derived from the badge's name, which
 * keeps a badge the same colour on the wall and on its detail screen.
 */
import { C } from '@/lib/tokens';
import type { BadgeAward } from '@/lib/api';

const TILES = [C.orange, C.purple, C.green, C.pink, C.blue, C.lime];

/** Fills dark enough to need a light glyph. */
const ON_DARK: string[] = [C.purple, C.blue];

export function badgeColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return TILES[Math.abs(h) % TILES.length]!;
}

export const badgeGlyph = (color: string) => (ON_DARK.includes(color) ? '#fff' : C.ink);

/** Awards carry no id, so a badge is addressed by its name. */
export const findAward = (awards: BadgeAward[] | undefined, name: string | undefined) =>
  awards?.find((a) => a.badge.name === name);
