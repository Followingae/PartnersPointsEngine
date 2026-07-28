/**
 * Sample badge wall for screens 45/46.
 *
 * TODO(api): replace with GET /customer/badges — earned badges carry an
 * `unlockedAt` and the bonus that was credited.
 */
import { C } from '@/lib/tokens';

export interface Badge {
  id: string;
  name: string;
  /** Tile fill once earned. */
  color: string;
  /** The purple tile needs a light glyph; the rest keep the ink one. */
  glyph: string;
  unlocked: boolean;
  blurb: string;
}

export const BADGES: Badge[] = [
  { id: 'early-bird', name: 'Early bird', color: C.orange, glyph: C.ink, unlocked: true, blurb: 'Ten visits before 9 AM. +150 pts added to Camel Bean.' },
  { id: 'converter', name: 'Converter', color: C.purple, glyph: '#fff', unlocked: true, blurb: 'Five conversions to Lulu Happiness. +150 pts added to your balance.' },
  { id: 'regular', name: 'Regular', color: C.green, glyph: C.ink, unlocked: true, blurb: 'Twenty visits to a single brand. +200 pts added to Camel Bean.' },
  { id: 'birthday', name: 'Birthday', color: C.pink, glyph: C.ink, unlocked: true, blurb: 'You spent your birthday with us. +250 pts added to your balance.' },
  { id: 'explorer', name: 'Explorer', color: C.wash, glyph: C.soft, unlocked: false, blurb: 'Earn at five different brands to unlock this one.' },
  { id: 'streak-10', name: 'Streak 10', color: C.wash, glyph: C.soft, unlocked: false, blurb: 'Keep a ten-week streak alive at any brand to unlock this one.' },
];

export const EARNED_SUMMARY = '8 of 16 earned';

export const findBadge = (id?: string | string[]) =>
  BADGES.find((b) => b.id === (Array.isArray(id) ? id[0] : id)) ?? BADGES[0];
