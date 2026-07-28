import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { BRAND, font } from '@/lib/tokens';

const CONFETTI: { left: `${number}%`; w: number; h: number; round: boolean; color: string; dur: number; delay: number }[] = [
  { left: '16%', w: 9, h: 14, round: false, color: BRAND.lime, dur: 2400, delay: 0 },
  { left: '44%', w: 8, h: 8, round: true, color: '#fff', dur: 2600, delay: 300 },
  { left: '74%', w: 9, h: 13, round: false, color: BRAND.sky, dur: 2200, delay: 150 },
];

function Piece({ p }: { p: (typeof CONFETTI)[number] }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: p.dur, delay: p.delay, easing: Easing.in(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, p]);
  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: p.left, width: p.w, height: p.h, borderRadius: p.round ? 999 : 2, backgroundColor: p.color, opacity: v.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }) }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '560deg'] }) }] }} />
  );
}

export default function BadgeUnlock() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pop = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }).start();
  }, [pop]);

  return (
    <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
      {CONFETTI.map((p, i) => <Piece key={i} p={p} />)}
      <Pressable onPress={() => router.back()} hitSlop={10} style={{ position: 'absolute', top: insets.top + 8, left: 22, width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
      </Pressable>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <LinearGradient colors={[BRAND.lime, '#9ac400']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 140, height: 140, borderRadius: 36, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.5, shadowRadius: 30, elevation: 12 }}>
          <Text style={{ fontSize: 64 }}>🌅</Text>
        </LinearGradient>
      </Animated.View>
      <Text style={{ marginTop: 30, fontFamily: font.mono(600), fontSize: 12, letterSpacing: 2, color: BRAND.lime }}>BADGE UNLOCKED</Text>
      <Text style={{ marginTop: 10, fontFamily: font.display(700), fontSize: 34, letterSpacing: -0.7, color: '#fff' }}>Early Bird</Text>
      <Text style={{ marginTop: 12, fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontFamily: font.sans(400) }}>You placed 5 orders before 9 AM. The city&apos;s barely awake — but you are.</Text>
      <View style={{ marginTop: 30, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 26 }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: BRAND.blue }}>Share badge</Text>
      </View>
    </LinearGradient>
  );
}
