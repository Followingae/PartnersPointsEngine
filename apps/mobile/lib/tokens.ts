/**
 * Design tokens ported from the Claude Design handoff "Partners Points - App".
 * The web design used CSS variables that flipped on data-theme; in React Native
 * we resolve them to a JS palette per theme via useTokens() (see theme.tsx).
 */
export type ThemeName = 'light' | 'dark';

export interface Tokens {
  canvas: string;
  card: string;
  ink: string;
  soft: string;
  faint: string;
  line: string;
  chip: string;
  barbg: string;
  map: string;
  mapline: string;
  /** Soft hero shadow for elevated cards (use with the `elevation` helper). */
  elevColor: string;
}

export const PALETTE: Record<ThemeName, Tokens> = {
  light: {
    canvas: '#F2F2F2',
    card: '#ffffff',
    ink: '#262626',
    soft: 'rgba(38,38,38,0.6)',
    faint: 'rgba(38,38,38,0.36)',
    line: 'rgba(38,38,38,0.08)',
    chip: '#ECECEF',
    barbg: 'rgba(255,255,255,0.92)',
    map: '#e3e6ea',
    mapline: '#d4d9df',
    elevColor: 'rgba(38,38,38,0.18)',
  },
  dark: {
    canvas: '#0f0f13',
    card: '#1b1b21',
    ink: '#F2F2F2',
    soft: 'rgba(242,242,242,0.6)',
    faint: 'rgba(242,242,242,0.36)',
    line: 'rgba(242,242,242,0.09)',
    chip: '#26262e',
    barbg: 'rgba(27,27,33,0.9)',
    map: '#17171d',
    mapline: '#26262e',
    elevColor: 'rgba(0,0,0,0.7)',
  },
};

/** Fixed brand accents — used as literals in the design regardless of theme. */
export const BRAND = {
  blue: '#0B04D9',
  deep: '#070459',
  lime: '#BFF205',
  coral: '#F2622E',
  purple: '#7A36D9',
  sky: '#1B78F2',
} as const;

/** Map a font family + weight to the @expo-google-fonts family name. */
type Weight = 400 | 500 | 600 | 700 | 800;
const JAKARTA: Record<Weight, string> = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
};
const BRICOLAGE: Record<Weight, string> = {
  400: 'BricolageGrotesque_400Regular',
  500: 'BricolageGrotesque_500Medium',
  600: 'BricolageGrotesque_600SemiBold',
  700: 'BricolageGrotesque_700Bold',
  800: 'BricolageGrotesque_800ExtraBold',
};
const MONO: Record<400 | 500 | 600, string> = {
  400: 'IBMPlexMono_400Regular',
  500: 'IBMPlexMono_500Medium',
  600: 'IBMPlexMono_600SemiBold',
};

export const font = {
  /** Body / UI — Plus Jakarta Sans */
  sans: (w: Weight = 400) => JAKARTA[w],
  /** Display / headings & big numbers — Bricolage Grotesque */
  display: (w: Weight = 700) => BRICOLAGE[w],
  /** Codes / labels — IBM Plex Mono */
  mono: (w: 400 | 500 | 600 = 500) => MONO[w],
};

/** All font family names to register with expo-font's useFonts. */
export const ALL_FONT_KEYS = [
  ...Object.values(JAKARTA),
  ...Object.values(BRICOLAGE),
  ...Object.values(MONO),
];

/** iOS-style soft shadow for elevated cards (apply spread to a View style). */
export function elevation(color: string) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 1,
    shadowRadius: 22,
    elevation: 8,
  };
}
