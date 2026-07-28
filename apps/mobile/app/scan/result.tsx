import { useEffect } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

const W = Math.min(Dimensions.get('window').width, 420);
const COLORS = [BRAND.lime, BRAND.blue, BRAND.purple, BRAND.sky];

function ConfettiPiece({ i }: { i: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(i * 90, withRepeat(withTiming(1, { duration: 2200 + (i % 4) * 200, easing: Easing.in(Easing.quad) }), -1, false));
  }, [v, i]);
  const left = ((i * 53) % 90) + 4;
  const color = COLORS[i % COLORS.length];
  const round = i % 2 === 0;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: v.value * 560 }, { rotate: `${v.value * 540}deg` }],
    opacity: 1 - v.value,
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: -10, left: (left / 100) * W, width: 9, height: round ? 9 : 14, borderRadius: round ? 999 : 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

export function Confetti({ count = 14 }: { count?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {Array.from({ length: count }).map((_, i) => (
        <ConfettiPiece key={i} i={i} />
      ))}
    </View>
  );
}

export default function ScanResult() {
  const router = useRouter();
  const t = useTokens();
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.6)) });
  }, [pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.4 + pop.value * 0.6 }], opacity: pop.value }));

  return (
    <Screen scroll={false}>
      <Confetti />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
        <Animated.View style={popStyle}>
          <LinearGradient colors={[BRAND.lime, '#9ac400']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', shadowColor: '#9ac400', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 8 }}>
            <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 13l4 4 10-11" />
            </Svg>
          </LinearGradient>
        </Animated.View>
        <Text style={{ marginTop: 24, fontFamily: font.display(700), fontSize: 56, color: '#4d5c00', letterSpacing: -1 }}>+120</Text>
        <Text style={{ marginTop: 14, fontFamily: font.display(700), fontSize: 22, letterSpacing: -0.4, color: t.ink }}>Points earned!</Text>
        <Text style={{ marginTop: 10, fontSize: 15, color: t.soft }}>At Camel Bean · JLT branch · just now</Text>
      </View>
      <View style={{ paddingHorizontal: 26, paddingBottom: 36, gap: 11 }}>
        <Pressable onPress={() => router.replace('/wallet/camel-bean')} style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17, alignItems: 'center', shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 6 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>View wallet</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/home')} style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.soft }}>Done</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
