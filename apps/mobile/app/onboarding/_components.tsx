import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, type ViewStyle } from 'react-native';
import { BRAND, font } from '@/lib/tokens';

/** The primary blue CTA used across onboarding. */
export function PrimaryButton({ label, onPress, style }: { label: string; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          backgroundColor: BRAND.blue,
          borderRadius: 18,
          paddingVertical: 17,
          alignItems: 'center',
          shadowColor: BRAND.blue,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.4,
          shadowRadius: 26,
          elevation: 8,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>{label}</Text>
    </Pressable>
  );
}

/** Blinking text caret (input cursor). */
export function Caret({ color = BRAND.blue, height = 24 }: { color?: string; height?: number }) {
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
  return <Animated.View style={{ width: 2, height, backgroundColor: color, opacity: o, marginLeft: 3, borderRadius: 1 }} />;
}

/** Pulsing dot (splash loader). */
export function PulseDot({ color, delay = 0 }: { color: string; delay?: number }) {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 600, delay, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: color, opacity: v, transform: [{ scale: v }] }}
    />
  );
}

/** Diagonal-striped gradient illustration placeholder (matches the design's
 *  repeating-stripe spot-illustration blocks). */
export function StripeOverlay() {
  const stripes = [];
  for (let i = -6; i < 18; i++) {
    stripes.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          top: -40,
          bottom: -40,
          left: i * 24,
          width: 12,
          backgroundColor: 'rgba(255,255,255,0.07)',
          transform: [{ rotate: '45deg' }],
        }}
      />,
    );
  }
  return <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>{stripes}</View>;
}

/** The "spot illustration" chip label used inside placeholder blocks. */
export function IllusChip({ label = 'spot illustration' }: { label?: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8 }}>
      <Text style={{ fontFamily: font.mono(500), fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>{label}</Text>
    </View>
  );
}
