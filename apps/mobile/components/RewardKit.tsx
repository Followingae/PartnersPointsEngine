/**
 * Shared pieces for the Rewards / Vouchers / Convert flows (design screens 30–42).
 *
 * Everything here composes the primitives in `components/UI.tsx` and the tokens
 * in `lib/tokens.ts` — no styling is invented beyond what the design specifies.
 */
import { ReactNode } from 'react';
import { Pressable, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C, R, T, font } from '@/lib/tokens';
import { H2, IconButton, Small } from '@/components/UI';

/* ------------------------------------------------------------------ icons */

export type IconName =
  | 'cup' | 'gift' | 'tag' | 'check' | 'alert' | 'swap'
  | 'left' | 'right' | 'minus' | 'plus' | 'dots';

const PATHS: Record<IconName, string[]> = {
  cup: ['M5 6h11v6a5.5 5.5 0 0 1-11 0z', 'M16 8h2.5a2.5 2.5 0 0 1 0 5H16M4 20h13'],
  gift: ['M4 11h16v9H4zM4 7h16v4H4zM12 7v13M8.5 7a2.5 2.5 0 1 1 3.5-2.4M15.5 7a2.5 2.5 0 1 0-3.5-2.4'],
  tag: ['M12 3l9 9-9 9-9-9z'],
  check: ['M5 13l4 4 10-11'],
  alert: ['M12 4.5l8.5 15H3.5z', 'M12 10v4M12 17h.01'],
  swap: ['M17 4v6h-6M7 20v-6h6', 'M19 10a7 7 0 0 0-13-2M5 14a7 7 0 0 0 13 2'],
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  minus: ['M5 12h14'],
  plus: ['M12 5v14M5 12h14'],
  dots: [],
};

const DOTS: Partial<Record<IconName, { cx: number; cy: number; r: number }[]>> = {
  tag: [{ cx: 12, cy: 9, r: 1.4 }],
  dots: [{ cx: 5, cy: 12, r: 1 }, { cx: 12, cy: 12, r: 1 }, { cx: 19, cy: 12, r: 1 }],
};

export function Ic({
  name, size = 20, color = C.ink, sw = 1.7,
}: { name: IconName; size?: number; color?: string; sw?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {(DOTS[name] ?? []).map((c) => (
        <Circle key={`${c.cx}-${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} stroke={color} strokeWidth={sw} />
      ))}
    </Svg>
  );
}

/* ------------------------------------------------------------- navigation */

/** Round back button, plus an optional trailing control. */
export function TopBar({ right, onBack }: { right?: ReactNode; onBack?: () => void }) {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton onPress={back} style={ROUND}>
        <Ic name="left" size={18} sw={1.9} />
      </IconButton>
      {right ?? null}
    </View>
  );
}

export const ROUND: ViewStyle = { borderRadius: R.chip, backgroundColor: C.canvas };

/* ------------------------------------------------------------------- rows */

/**
 * The list row used on every detail, confirm and history screen: optional icon
 * tile, title over subtitle, optional right-hand value or chevron.
 */
export function ListRow({
  icon, iconBg, iconColor = C.ink, title, sub, value, valueTone = 'ink',
  chevron, divider, onPress,
}: {
  icon?: IconName;
  iconBg?: string;
  iconColor?: string;
  title: string;
  sub?: string;
  value?: string;
  valueTone?: 'ink' | 'faint';
  chevron?: boolean;
  divider?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 18,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: C.hairline,
      }}
    >
      {icon ? (
        <View style={{
          width: 44, height: 44, borderRadius: R.control,
          backgroundColor: iconBg ?? C.canvas,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ic name={icon} size={20} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{title}</Text>
        {sub ? <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{sub}</Small> : null}
      </View>
      {value ? (
        <Text style={{
          fontFamily: font(valueTone === 'faint' ? 500 : 600),
          fontSize: valueTone === 'faint' ? 12.5 : 15,
          lineHeight: valueTone === 'faint' ? 18 : 21,
          color: valueTone === 'faint' ? C.soft : C.ink,
        }}>
          {value}
        </Text>
      ) : null}
      {chevron ? <Ic name="right" size={18} color={C.soft} sw={2} /> : null}
    </View>
  );
  return onPress
    ? <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>{body}</Pressable>
    : body;
}

/* --------------------------------------------------------------- layout -- */

/** Centred hero used by every confirmation / failure state. */
export function CenterState({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
  );
}

/** 88px disc behind a glyph or logo. */
export function Disc({ children, background = C.canvas }: { children: ReactNode; background?: string }) {
  return (
    <View style={{
      width: 88, height: 88, borderRadius: R.chip, backgroundColor: background,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </View>
  );
}

/** Actions pinned to the bottom of the screen. */
export function Footer({ children }: { children: ReactNode }) {
  return <View style={{ marginTop: 'auto', paddingTop: 20 }}>{children}</View>;
}

/** Centred text link that sits under a primary button. */
export function TextAction({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ paddingVertical: 14 }, pressed ? { opacity: 0.6 } : null]}>
      <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

/** Small status pill with a leading glyph. */
export function NotePill({ label }: { label: string }) {
  return (
    <View style={{
      marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 9,
      paddingVertical: 10, paddingHorizontal: 16, borderRadius: R.chip,
      backgroundColor: 'rgba(0,179,126,.14)',
    }}>
      <Ic name="check" size={15} color={C.greenDeep} sw={2.4} />
      <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.greenDeep }}>{label}</Text>
    </View>
  );
}

/** Uppercase group heading used between history sections. */
export function GroupLabel({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[T.label, { color: C.soft, letterSpacing: 1.3 }, style]}>{children}</Text>;
}

/* ------------------------------------------------------------------ sheet */

/**
 * Modal-style screen: a colour-washed backdrop with the content sheet resting
 * on the bottom edge (design screens 32 and 40).
 */
export function SheetScreen({
  backdrop, title, children,
}: { backdrop: string; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: backdrop }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(21,21,15,.45)' }} />
      <View style={{
        backgroundColor: C.surface,
        borderTopLeftRadius: R.sheet + 4,
        borderTopRightRadius: R.sheet + 4,
        paddingTop: 14,
        paddingHorizontal: 26,
        paddingBottom: 32 + insets.bottom,
      }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 42, height: 5, borderRadius: R.chip, backgroundColor: 'rgba(21,21,15,.08)' }} />
        </View>
        <H2 style={{ marginTop: 22, fontSize: 26, lineHeight: 32 }}>{title}</H2>
        {children}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- barcode  */

/**
 * Procedural stand-in for the scannable code on a voucher. Deterministic so the
 * same voucher always renders the same pattern.
 * TODO(api): server-issued code — replace with the real payload from the API.
 */
export function QrPlaceholder({ size = 150, seed = 1 }: { size?: number; seed?: number }) {
  const n = 21;
  const cell = size / n;
  let s = (seed * 7919 + 104729) % 2147483647;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483647;
    return s / 2147483647;
  };
  const inFinder = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);

  const cells: ReactNode[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const on = rnd() > 0.5;
      if (on && !inFinder(r, c)) {
        cells.push(
          <Rect key={`${r}:${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={C.ink} />,
        );
      }
    }
  }

  const finder = (col: number, row: number) => (
    <Rect key={`f${col}${row}`} x={col * cell} y={row * cell} width={cell * 7} height={cell * 7} fill={C.ink} />
  );
  const finderInner = (col: number, row: number) => [
    <Rect key={`fw${col}${row}`} x={(col + 1) * cell} y={(row + 1) * cell} width={cell * 5} height={cell * 5} fill={C.surface} />,
    <Rect key={`fi${col}${row}`} x={(col + 2) * cell} y={(row + 2) * cell} width={cell * 3} height={cell * 3} fill={C.ink} />,
  ];

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {cells}
      {finder(0, 0)}{finderInner(0, 0)}
      {finder(n - 7, 0)}{finderInner(n - 7, 0)}
      {finder(0, n - 7)}{finderInner(0, n - 7)}
    </Svg>
  );
}

/** Punched-hole divider across a ticket. */
export function Perforation({ background, notch }: { background: string; notch: string }) {
  return (
    <View style={{ height: 22, backgroundColor: background, justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', marginHorizontal: 14, overflow: 'hidden' }}>
        {Array.from({ length: 26 }, (_, i) => (
          <View key={i} style={{ width: 6, height: 2, marginRight: 5, backgroundColor: 'rgba(255,255,255,.5)' }} />
        ))}
      </View>
      <View style={[NOTCH, { left: -11, backgroundColor: notch }]} />
      <View style={[NOTCH, { right: -11, backgroundColor: notch }]} />
    </View>
  );
}

const NOTCH: ViewStyle = {
  position: 'absolute',
  top: 0,
  width: 22,
  height: 22,
  borderRadius: R.chip,
};
