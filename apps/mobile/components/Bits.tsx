/**
 * Shared chrome for the secondary screens — the back bar, the settings/list
 * row, and the stroked icon set lifted straight from the v3 design file.
 *
 * Everything here is built out of `@/lib/tokens` + `@/components/UI`; it adds
 * no new visual language of its own.
 */
import { ReactNode } from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C, R, T, font } from '@/lib/tokens';
import { Small } from '@/components/UI';

export type IconName =
  | 'back' | 'chevron' | 'filter' | 'share' | 'check'
  | 'trophy' | 'lock' | 'user' | 'bell' | 'shield' | 'card' | 'globe'
  | 'help' | 'info' | 'logout' | 'flame';

const GLYPHS: Record<IconName, ReactNode> = {
  back: <Path d="M15 5l-7 7 7 7" />,
  chevron: <Path d="M9 5l7 7-7 7" />,
  filter: <Path d="M4 6h16M7 12h10M10 18h4" />,
  share: (
    <>
      <Path d="M12 16V4M8 8l4-4 4 4" />
      <Path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
    </>
  ),
  check: <Path d="M5 13l4 4 10-11" />,
  trophy: <Path d="M8 4h8v5a4 4 0 0 1-8 0zM6 5H4v2a3 3 0 0 0 3 3M18 5h2v2a3 3 0 0 1-3 3M10 18h4M12 13v5" />,
  lock: (
    <>
      <Rect x={5} y={10} width={14} height={10} rx={2} />
      <Path d="M8 10V8a4 4 0 0 1 8 0v2" />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={3.4} />
      <Path d="M5 19.5a7 7 0 0 1 14 0" />
    </>
  ),
  bell: (
    <>
      <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <Path d="M10.5 20a1.8 1.8 0 0 0 3 0" />
    </>
  ),
  shield: <Path d="M12 3l8 3v6c0 5-3.6 8.2-8 9-4.4-.8-8-4-8-9V6z" />,
  card: (
    <>
      <Rect x={3} y={6} width={18} height={13} rx={3} />
      <Path d="M16 12h3" />
    </>
  ),
  globe: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M3.5 12h17M12 3.5c2.4 2.4 2.4 14.6 0 17M12 3.5c-2.4 2.4-2.4 14.6 0 17" />
    </>
  ),
  help: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.7.3-.9.9-.9 1.5M12 16.6h.01" />
    </>
  ),
  info: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 11.2v5M12 7.6h.01" />
    </>
  ),
  logout: <Path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h9" />,
  flame: <Path d="M12 3s5 4.2 5 8.6a5 5 0 0 1-10 0C7 9.4 9 8 9 8s.4 2.2 1.6 2.2C12 10.2 12 6 12 3z" />,
};

export function Icon({
  name, size = 19, color = C.ink, weight = 1.7,
}: { name: IconName; size?: number; color?: string; weight?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </Svg>
  );
}

/** Round wash-filled back button, with an optional trailing control. */
export function BackBar({ fallback = '/', right }: { fallback?: string; right?: ReactNode }) {
  const router = useRouter();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  };
  return (
    <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <RoundButton onPress={goBack}><Icon name="back" size={18} weight={1.9} /></RoundButton>
      {right}
    </View>
  );
}

/** 40px circular control — the design's header affordance. */
export function RoundButton({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { width: 40, height: 40, borderRadius: 999, backgroundColor: C.wash, alignItems: 'center', justifyContent: 'center' },
        pressed ? { opacity: 0.7 } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Rounded-square icon tile that fronts a list row. */
export function Tile({
  children, size = 42, background = C.wash, radius = R.small,
}: { children: ReactNode; size?: number; background?: string; radius?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}

/**
 * The list row used by activity, referrals and every settings screen:
 * leading tile · title + subtitle · trailing value or chevron.
 */
export function ListRow({
  lead, title, sub, trailing, divider = true, onPress,
}: {
  lead?: ReactNode;
  title: string;
  sub?: string;
  trailing?: ReactNode;
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
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{title}</Text>
        {sub ? <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{sub}</Small> : null}
      </View>
      {trailing ?? <Icon name="chevron" size={18} color={C.soft} weight={2} />}
    </View>
  );
  return onPress
    ? <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>{body}</Pressable>
    : body;
}

/** Trailing amount on an activity/referral row. */
export function Amount({ value, color = C.ink }: { value: string; color?: string }) {
  return <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color }}>{value}</Text>;
}

/** Centred low-emphasis text action that sits under a primary button. */
export function TextAction({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
      <Text style={{ textAlign: 'center', fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted, padding: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Paragraph under a screen title — 14.5/1.55 muted, per the design. */
export function Lede({ children, style, center }: { children: ReactNode; style?: ViewStyle; center?: boolean }) {
  return (
    <View style={style}>
      <Text style={[T.body, { fontSize: 14.5, lineHeight: 22.5, color: C.muted }, center ? { textAlign: 'center' } : null]}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Filled / empty stamp dots for the repeatable "buy 9, get 1 free" cards.
 * Filled stamps carry the same tick the design uses on completed segments.
 */
export function Stamps({
  done, total, color, size = 16,
}: { done: number; total: number; color: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            backgroundColor: i < done ? color : C.wash,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {i < done ? <Icon name="check" size={size * 0.62} weight={3} /> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The wide progress segments from screen 44 — one block per visit or stamp,
 * ticked once earned. Wraps when a stamp card runs past five steps.
 */
export function Segments({ done, total, color }: { done: number; total: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flexGrow: 1,
            flexBasis: total > 5 ? '17%' : 0,
            height: 52,
            borderRadius: R.control,
            backgroundColor: i < done ? color : C.wash,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {i < done ? <Icon name="check" size={20} weight={2.4} /> : null}
        </View>
      ))}
    </View>
  );
}

/** The pill toggle used on the notification and privacy screens. */
export function Toggle({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 46,
        height: 27,
        borderRadius: 999,
        backgroundColor: on ? C.ink : C.wash,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 3,
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <View style={{ width: 21, height: 21, borderRadius: 999, backgroundColor: C.surface }} />
    </View>
  );
}
