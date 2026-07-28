/**
 * Partners Points — design tokens (customer app v3).
 *
 * Lifted from `.design-ref/customer-app/Partners Points - Customer App.dc.html`.
 * v3 is light-only and typeset entirely in Plus Jakarta Sans — the earlier dark
 * palette and the Bricolage/Plex pairing are gone.
 */

export const C = {
  /** Page background — warm off-white. */
  canvas: '#F4F3EF',
  /** Cards, sheets, anything raised. */
  surface: '#FFFFFF',
  /** Primary text + primary buttons. */
  ink: '#15150F',
  /** Deepest black — device chrome, QR screen, hero cards. */
  black: '#0b0a0d',

  // text tones over the canvas
  muted: 'rgba(21,21,15,.68)',
  soft: 'rgba(21,21,15,.62)',
  faint: 'rgba(21,21,15,.45)',
  hairline: 'rgba(21,21,15,.10)',
  wash: '#EFEEEA',

  // accents
  lime: '#E1FF3D',
  orange: '#FF4A1C',
  blue: '#1B5CFF',
  electric: '#0B04D9',
  green: '#00B37E',
  greenDeep: '#0A6B4B',
  purple: '#7B2FF7',
  pink: '#FF1F6B',
  crimson: '#C2004A',
  amber: '#B25A00',
  slate: '#1A1D22',
} as const;

/** Semantic aliases so screens read by meaning, not by colour. */
export const S = {
  earn: C.green,
  earnInk: C.greenDeep,
  burn: C.pink,
  spend: C.crimson,
  alert: C.orange,
  info: C.blue,
  highlight: C.lime,
} as const;

export const R = {
  chip: 999,
  card: 18,
  tile: 16,
  control: 14,
  small: 13,
  sheet: 26,
} as const;

export const SP = {
  gutter: 26,
  gap: 14,
  tight: 8,
} as const;

/** Soft, low-contrast elevation — the design leans on tone, not shadow. */
export const shadow = {
  card: {
    shadowColor: '#15150F',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#15150F',
    shadowOpacity: 0.1,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
} as const;

type Weight = 400 | 500 | 600 | 700 | 800;
const JAKARTA: Record<Weight, string> = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
};

/** Plus Jakarta Sans is the whole type system in v3. */
export const font = (w: Weight = 500) => JAKARTA[w];

/** Font families to register with expo-font's useFonts. */
export const ALL_FONT_KEYS = Object.values(JAKARTA);

/**
 * Type scale observed in the design.
 *
 * Every entry carries an explicit lineHeight. Without one, React Native sizes
 * the line box from the font's own metrics, which clips Plus Jakarta Sans's
 * ascenders and descenders — worst on Android and worst at display sizes.
 * Display sizes get a tight ratio (~1.15) so headlines stay compact; running
 * text gets ~1.45 so it stays readable.
 */
export const T = {
  h1: { fontFamily: font(600), fontSize: 32, lineHeight: 38, letterSpacing: -0.96 },
  h2: { fontFamily: font(600), fontSize: 24, lineHeight: 29, letterSpacing: -0.6 },
  h3: { fontFamily: font(600), fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  stat: { fontFamily: font(600), fontSize: 44, lineHeight: 51, letterSpacing: -1.3 },
  body: { fontFamily: font(500), fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font(600), fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font(500), fontSize: 13, lineHeight: 19 },
  tiny: { fontFamily: font(500), fontSize: 11.5, lineHeight: 16 },
  label: { fontFamily: font(500), fontSize: 11, lineHeight: 15, letterSpacing: 1.5, textTransform: 'uppercase' as const },
} as const;
