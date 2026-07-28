import { Pressable, Text, View, ViewStyle } from 'react-native';
import { C, R, font, shadow } from '@/lib/tokens';
import { pts } from '@/components/UI';

/**
 * The brand card — the hero object of the whole app.
 *
 * Two sizes, both lifted from the v3 design:
 *  · `full` — the 200pt deck card on Cards (home) and anywhere a single
 *    membership is the subject.
 *  · `tile` — the 120pt half-width card in the All cards grid.
 *
 * The card is filled with the brand's own colour, so type and hairlines are
 * derived from that fill rather than from the page palette.
 */

const parseHex = (hex: string) => {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** Brand fills dark enough to need white type. Everything else takes ink. */
const ON_DARK: string[] = [C.purple, C.blue, C.electric, C.ink, C.black, C.greenDeep];
/** Every fill the design itself ships; anything else came from a brand. */
const OURS: string[] = Object.values(C);

/**
 * Readable type over a fill. The design's own palette is decided by hand — a
 * brand-supplied colour can be anything, so that case falls back to perceived
 * brightness rather than guessing.
 */
export const brandFg = (color: string) => {
  if (ON_DARK.includes(color)) return '#fff';
  if (OURS.includes(color)) return C.ink;
  const [r, g, b] = parseHex(color);
  if (Number.isNaN(r)) return C.ink;
  return (r * 299 + g * 587 + b * 114) / 1000 < 150 ? '#fff' : C.ink;
};

/** Fills a card rotates through when its brand hasn't set one. */
const PALETTE: string[] = [C.green, C.purple, C.orange, C.blue, C.pink, C.electric];
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * The fill for one brand's card.
 *
 * Keyed off the brand id rather than a list index so a card keeps the same
 * colour in the deck, the grid and its detail screen no matter what order —
 * or how many — the API returns.
 */
export function brandColor(brandId: string, branding?: Record<string, unknown> | null): string {
  const own = branding?.primaryColor;
  if (typeof own === 'string' && HEX6.test(own)) return own;
  let h = 0;
  for (let i = 0; i < brandId.length; i += 1) h = (h * 31 + brandId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** The 1–2 letters in the badge, from the brand's name. */
export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The brand fill at `alpha` — used for the current tier's 8% wash. */
export function brandTint(hex: string, alpha: number) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * The brand fill pre-blended with the ink scrim the design lays over it when a
 * sheet is open, so the dim reaches the status bar without an overlay view.
 */
export function brandScrim(hex: string, amount = 0.45) {
  const [r1, g1, b1] = parseHex(hex);
  const [r2, g2, b2] = parseHex(C.ink);
  const mix = (a: number, b: number) => Math.round(a * (1 - amount) + b * amount);
  return `rgb(${mix(r1, r2)},${mix(g1, g2)},${mix(b1, b2)})`;
}
/** Translucent veil for the initial badge, tuned to the fill's brightness. */
const veil = (color: string) => (brandFg(color) === '#fff' ? 'rgba(255,255,255,.20)' : 'rgba(21,21,15,.16)');
/** Progress track behind the white fill. */
const trackOn = (color: string) => (brandFg(color) === '#fff' ? 'rgba(255,255,255,.26)' : 'rgba(21,21,15,.22)');

export type BrandCardProps = {
  name: string;
  /** 1–2 letters shown in the badge. */
  initial: string;
  /** The brand's fill colour. */
  color: string;
  tier?: string;
  points: number;
  /** "240 to Gold" · "90 pts expire 30 Jul". */
  footnote?: string;
  /** 0–1. Draws the hairline bar under the footnote. */
  progress?: number;
  size?: 'full' | 'tile';
  /** Replaces the tier with a SPONSORED micro-label. */
  sponsored?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

export function BrandCard({
  name, initial, color, tier, points, footnote, progress, size = 'full', sponsored, onPress, style,
}: BrandCardProps) {
  const fg = brandFg(color);
  const tile = size === 'tile';

  const badge = tile
    ? { width: 26, height: 26, radius: 9, size: 10 }
    : { width: 38, height: 38, radius: 12, size: 13 };

  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tile ? 9 : 12 }}>
      <View
        style={{
          width: badge.width, height: badge.height, borderRadius: badge.radius,
          backgroundColor: veil(color), alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: font(600), fontSize: badge.size, lineHeight: badge.size + 5, color: fg }}>{initial}</Text>
      </View>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: font(600),
          fontSize: tile ? 12.5 : 17,
          lineHeight: tile ? 17 : 23,
          letterSpacing: tile ? 0 : -0.17,
          color: fg,
        }}
      >
        {name}
      </Text>
      {!tile && sponsored ? (
        <Text style={{ fontFamily: font(500), fontSize: 10, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase', color: fg }}>
          Sponsored
        </Text>
      ) : null}
      {!tile && !sponsored && tier ? (
        <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: fg }}>{tier}</Text>
      ) : null}
    </View>
  );

  const amount = (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: tile ? 6 : 8 }}>
      <Text
        style={{
          fontFamily: font(600),
          fontSize: tile ? 26 : 48,
          // Must exceed fontSize — a tighter line box crops the digits.
          lineHeight: tile ? 30 : 55,
          letterSpacing: tile ? -0.78 : -1.44,
          color: fg,
        }}
      >
        {pts(points)}
      </Text>
      <Text style={{ fontFamily: font(500), fontSize: tile ? 11 : 14, lineHeight: tile ? 15 : 19, color: fg }}>pts</Text>
    </View>
  );

  const body = (
    <View
      style={[
        {
          height: tile ? 120 : 200,
          borderRadius: tile ? 20 : 26,
          padding: tile ? 16 : 24,
          backgroundColor: color,
          justifyContent: 'space-between',
        },
        tile ? null : shadow.card,
        style,
      ]}
    >
      {head}
      {tile ? (
        <View>
          {amount}
          {tier ? (
            <Text style={{ marginTop: 6, fontFamily: font(500), fontSize: 11, lineHeight: 15, color: fg }}>{tier}</Text>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {amount}
          {footnote || progress !== undefined ? (
            <View style={{ gap: 9 }}>
              {footnote ? (
                <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: fg }}>{footnote}</Text>
              ) : null}
              {progress !== undefined ? <OnColorBar value={progress} color={color} /> : null}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.94 } : null)}>
      {body}
    </Pressable>
  );
}

/** The 3pt progress hairline that sits on top of a brand fill. */
export function OnColorBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 3, borderRadius: 2, backgroundColor: trackOn(color) }}>
      <View style={{ height: 3, width: `${pct * 100}%`, borderRadius: 2, backgroundColor: '#fff' }} />
    </View>
  );
}

/** Paid placement on Cards (home): brand header, headline, CTA pill. */
export function SponsoredOffer({
  name, initial, color, headline, cta, onPress,
}: {
  name: string; initial: string; color: string; headline: string; cta: string; onPress?: () => void;
}) {
  const fg = brandFg(color);
  const body = (
    <View style={{ borderRadius: 24, backgroundColor: color, padding: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 26, height: 26, borderRadius: 9, backgroundColor: veil(color),
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: font(600), fontSize: 10, lineHeight: 14, color: fg }}>{initial}</Text>
          </View>
          <Text style={{ fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: fg }}>{name}</Text>
        </View>
        <Text style={{ fontFamily: font(500), fontSize: 10, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase', color: fg }}>
          Sponsored
        </Text>
      </View>
      <Text
        style={{
          marginTop: 26, fontFamily: font(600), fontSize: 24, lineHeight: 27.4,
          letterSpacing: -0.72, color: fg, maxWidth: 240,
        }}
      >
        {headline}
      </Text>
      <View
        style={{
          alignSelf: 'flex-start', marginTop: 18, backgroundColor: '#fff',
          paddingHorizontal: 16, paddingVertical: 10, borderRadius: R.chip,
        }}
      >
        <Text style={{ fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: C.ink }}>{cta}</Text>
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.94 } : null)}>
      {body}
    </Pressable>
  );
}

/** The dashed "Add a card" slot that closes the All cards grid. */
export function AddCardTile({ onPress, style }: { onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 120, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          borderWidth: 1.5, borderColor: 'rgba(21,21,15,.08)', opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.muted }}>Add a card</Text>
    </Pressable>
  );
}

export type BrandSample = {
  id: string;
  name: string;
  initial: string;
  color: string;
  tier: string;
  points: number;
  footnote?: string;
  progress?: number;
  category?: string;
};

// TODO(api): replace with the customer's real cards (GET /me/cards).
export const SAMPLE_BRANDS: BrandSample[] = [
  {
    id: 'verde-market', name: 'Verde Market', initial: 'V', color: C.green,
    tier: 'Green', points: 760, footnote: '240 to Gold', progress: 0.62, category: 'Grocery · 3 branches',
  },
  {
    id: 'nur-patisserie', name: 'Núr Pâtisserie', initial: 'N', color: C.purple,
    tier: 'Silver', points: 1150, footnote: '90 pts expire 30 Jul', progress: 0.44, category: 'Bakery · 4 branches',
  },
  {
    id: 'camel-bean', name: 'Camel Bean', initial: 'CB', color: C.orange,
    tier: 'Gold', points: 2480, footnote: '320 to Black', progress: 0.82, category: 'Coffee · 6 branches',
  },
  {
    id: 'bloom-coffee', name: 'Bloom Coffee', initial: 'BC', color: C.blue,
    tier: 'Green', points: 310, category: 'Coffee · 2 branches',
  },
  {
    id: 'olive-thyme', name: 'Olive & Thyme', initial: 'OT', color: C.pink,
    tier: 'Green', points: 95, category: 'Deli · 1 branch',
  },
];

/** Resolve a `[id]` route param to a brand, falling back to Camel Bean. */
export function getBrand(id?: string | string[]): BrandSample {
  const key = Array.isArray(id) ? id[0] : id;
  return SAMPLE_BRANDS.find((b) => b.id === key) ?? SAMPLE_BRANDS[2];
}
