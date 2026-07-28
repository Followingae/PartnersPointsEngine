import { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, S, SP, T, font, shadow } from '@/lib/tokens';

/** Screen container: canvas background, safe areas, tab-bar clearance. */
export function Screen({
  children, scroll = true, pad = true, background = C.canvas, bottomGap = 108, refreshing, onRefresh,
}: {
  children: ReactNode; scroll?: boolean; pad?: boolean; background?: string; bottomGap?: number;
  /** Pass both to enable pull-to-refresh. */
  refreshing?: boolean; onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const style: ViewStyle = {
    flex: 1,
    backgroundColor: background,
    paddingTop: insets.top,
  };
  const inner: ViewStyle = {
    paddingHorizontal: pad ? SP.gutter : 0,
    paddingBottom: bottomGap + insets.bottom,
  };
  if (!scroll) {
    return <View style={style}><View style={[{ flex: 1 }, inner]}>{children}</View></View>;
  }
  return (
    <View style={style}>
      <ScrollView
        contentContainerStyle={inner}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh
            ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={C.soft} />
            : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Centred spinner for a screen's first load. */
export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 64, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={C.soft} />
      {label ? <Small>{label}</Small> : null}
    </View>
  );
}

/**
 * What went wrong and how to get out of it. Errors carry the API's own message
 * where there is one — "You don't have enough points" beats "Request failed".
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 14 }}>
      <H3 style={{ textAlign: 'center' }}>Couldn’t load this</H3>
      <Body tone="muted" style={{ textAlign: 'center' }}>{message}</Body>
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} style={{ marginTop: 6, paddingHorizontal: 28 }} />
      ) : null}
    </View>
  );
}

/** Nothing here yet — said in the user's terms, with a way forward when there is one. */
export function EmptyState({
  title, body, actionLabel, onAction,
}: { title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
      <H3 style={{ textAlign: 'center' }}>{title}</H3>
      {body ? <Body tone="muted" style={{ textAlign: 'center' }}>{body}</Body> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: 6, paddingHorizontal: 28 }} />
      ) : null}
    </View>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[T.h1, { color: C.ink }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[T.h2, { color: C.ink }, style]}>{children}</Text>;
}
export function H3({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[T.h3, { color: C.ink }, style]}>{children}</Text>;
}
export function Body({ children, style, tone = 'ink' }: { children: ReactNode; style?: TextStyle; tone?: 'ink' | 'muted' | 'faint' }) {
  const color = tone === 'ink' ? C.ink : tone === 'muted' ? C.muted : C.faint;
  return <Text style={[T.body, { color }, style]}>{children}</Text>;
}
export function Small({ children, style, tone = 'muted' }: { children: ReactNode; style?: TextStyle; tone?: 'ink' | 'muted' | 'faint' }) {
  const color = tone === 'ink' ? C.ink : tone === 'muted' ? C.muted : C.faint;
  return <Text style={[T.small, { color }, style]}>{children}</Text>;
}
export function Label({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[T.label, { color: C.soft }, style]}>{children}</Text>;
}

/** White rounded card — the workhorse container. */
export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const body = (
    <View style={[styles.card, style]}>{children}</View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed ? { opacity: 0.9 } : null}>{body}</Pressable> : body;
}

/** Full-width primary action. Ink by default, lime for celebratory moments. */
export function Button({
  label, onPress, tone = 'primary', loading, disabled, style, radius, height,
}: {
  label: string; onPress?: () => void; tone?: 'primary' | 'lime' | 'ghost' | 'outline';
  loading?: boolean; disabled?: boolean; style?: ViewStyle;
  /** The design uses 18 on onboarding CTAs and 14 elsewhere. */
  radius?: number;
  height?: number;
}) {
  const bg = tone === 'primary' ? C.ink : tone === 'lime' ? C.lime : tone === 'ghost' ? C.wash : 'transparent';
  const fg = tone === 'primary' ? '#fff' : C.ink;
  const border = tone === 'outline' ? { borderWidth: 1.4, borderColor: C.hairline } : null;
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        radius !== undefined ? { borderRadius: radius } : null,
        height !== undefined ? { height } : null,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.92 : 1 },
        border,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={fg} />
        : <Text style={{ fontFamily: font(600), fontSize: 15.5, lineHeight: 22, color: fg }}>{label}</Text>}
    </Pressable>
  );
}

/** Pill — status, filters, tags. */
export function Chip({
  label, tone = 'neutral', style,
}: { label: string; tone?: 'neutral' | 'lime' | 'green' | 'pink' | 'ink' | 'orange'; style?: ViewStyle }) {
  const map = {
    neutral: { bg: C.wash, fg: C.muted },
    lime: { bg: C.lime, fg: C.ink },
    green: { bg: 'rgba(0,179,126,.14)', fg: C.greenDeep },
    pink: { bg: 'rgba(255,31,107,.12)', fg: C.crimson },
    orange: { bg: 'rgba(255,74,28,.12)', fg: C.orange },
    ink: { bg: C.ink, fg: '#fff' },
  } as const;
  const { bg, fg } = map[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      <Text style={{ fontFamily: font(600), fontSize: 11.5, lineHeight: 16, color: fg }}>{label}</Text>
    </View>
  );
}

/** Circular icon button used in headers. */
export function IconButton({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconBtn, pressed ? { opacity: 0.7 } : null, style]}>
      {children}
    </Pressable>
  );
}

/** Screen header with an optional trailing slot. */
export function Header({ title, right, sub }: { title: string; right?: ReactNode; sub?: string }) {
  return (
    <View style={{ marginTop: 16, marginBottom: 18, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <H1>{title}</H1>
        {sub ? <Small style={{ marginTop: 2 }}>{sub}</Small> : null}
      </View>
      {right}
    </View>
  );
}

/** Thin progress track (tiers, challenges, stamp cards). */
export function Progress({
  value, total, color = C.ink, height = 8, track = C.wash,
}: { value: number; total: number; color?: string; height?: number; track?: string }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <View style={{ height, borderRadius: 999, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}

/** Row with a label on the left and a value on the right. */
export function Row({ label, value, valueColor = C.ink, style }: { label: string; value: string; valueColor?: string; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}>
      <Text style={[T.body, { color: C.muted }]}>{label}</Text>
      <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: valueColor }}>{value}</Text>
    </View>
  );
}

export const money = (minor: number, currency = 'AED') =>
  `${currency} ${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pts = (v: number) => v.toLocaleString('en-US');

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: R.card,
    padding: 18,
    ...shadow.card,
  },
  btn: {
    height: 54,
    borderRadius: R.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: R.chip,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: R.small,
    backgroundColor: C.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { C, S, R, SP, T, font, shadow };
