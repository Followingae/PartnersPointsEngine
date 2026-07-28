import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Body, H1, IconButton } from '@/components/UI';
import { C, font } from '@/lib/tokens';

/** Onboarding sets its headline two steps down from the app-wide H1. */
export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <H1 style={{ fontSize: 30, letterSpacing: -0.75, lineHeight: 34, ...style }}>{children}</H1>;
}

export function Sub({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Body tone="muted" style={{ fontSize: 14.5, lineHeight: 22, ...style }}>{children}</Body>;
}

/** Footer block pinned to the bottom of the screen. */
export function Footer({ children }: { children: ReactNode }) {
  return <View style={{ marginTop: 'auto' }}>{children}</View>;
}

/** Centred secondary action under a primary button. */
export function TextLink({ label, onPress, style }: { label: string; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.6 : 1 }, style]}
    >
      <Text style={{ fontFamily: font(600), fontSize: 15, color: C.muted }}>{label}</Text>
    </Pressable>
  );
}

/** Round back chevron used on the phone and OTP steps. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  return (
    <IconButton onPress={onPress} style={{ borderRadius: 999, backgroundColor: C.canvas }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
    </IconButton>
  );
}

/** Square brand monogram — sized per surface (card, list row, tile). */
export function Monogram({
  code, size, radius, bg, color, fontSize,
}: { code: string; size: number; radius: number; bg: string; color: string; fontSize: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font(600), fontSize, color }}>{code}</Text>
    </View>
  );
}

/** Blinking text caret — stands in for a focused input in these static screens. */
export function Caret({ height = 22, color = C.ink, offset = 4 }: { height?: number; color?: string; offset?: number }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0, duration: 0, delay: 500, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 0, delay: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={{ width: 2, height, backgroundColor: color, opacity: o, marginLeft: offset }} />;
}

/** One dot of the splash loader. */
export function PulseDot({ delay = 0 }: { delay?: number }) {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 600, delay, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: C.ink, opacity: v }} />;
}
