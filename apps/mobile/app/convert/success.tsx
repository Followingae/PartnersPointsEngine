import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

const LULU_OUT = '560';
const PIECES: { left: `${number}%`; w: number; h: number; round: boolean; color: string; dur: number; delay: number }[] = [
  { left: '8%', w: 9, h: 14, round: false, color: BRAND.blue, dur: 2200, delay: 0 },
  { left: '22%', w: 8, h: 8, round: true, color: BRAND.lime, dur: 2400, delay: 300 },
  { left: '38%', w: 10, h: 10, round: false, color: BRAND.sky, dur: 2100, delay: 150 },
  { left: '54%', w: 8, h: 14, round: false, color: BRAND.purple, dur: 2500, delay: 450 },
  { left: '70%', w: 9, h: 9, round: true, color: BRAND.lime, dur: 2300, delay: 100 },
  { left: '86%', w: 8, h: 13, round: false, color: BRAND.blue, dur: 2200, delay: 350 },
  { left: '48%', w: 8, h: 8, round: true, color: BRAND.sky, dur: 2600, delay: 600 },
];

function Confetti({ p }: { p: (typeof PIECES)[number] }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: p.dur, delay: p.delay, easing: Easing.in(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, p]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: p.left,
        width: p.w,
        height: p.h,
        borderRadius: p.round ? 999 : 2,
        backgroundColor: p.color,
        opacity: v.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '560deg'] }) },
        ],
      }}
    />
  );
}

export default function ConvertSuccess() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pop = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }).start();
  }, [pop]);

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,4,30,0.5)' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 30 + insets.bottom, alignItems: 'center', overflow: 'hidden' }}>
        {PIECES.map((p, i) => <Confetti key={i} p={p} />)}
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginTop: 14, shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.55, shadowRadius: 22, elevation: 10 }}>
            <Svg width={42} height={42} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 13l4 4 10-11" /></Svg>
          </LinearGradient>
        </Animated.View>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, marginTop: 20, letterSpacing: -0.3, color: t.ink }}>{LULU_OUT} added 🎉</Text>
        <Text style={{ fontSize: 14, color: t.soft, marginTop: 6, fontFamily: font.sans(400) }}>Lulu Happiness Points · to •••• 4821</Text>
        <View style={{ marginTop: 20, gap: 8, backgroundColor: t.chip, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 22 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 30 }}>
            <Text style={{ fontSize: 12.5, color: t.soft, fontFamily: font.sans(400) }}>Converted</Text>
            <Text style={{ fontFamily: font.sans(600), fontSize: 12.5, color: t.ink }}>2,800 pts · 3 merchants</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 30 }}>
            <Text style={{ fontSize: 12.5, color: t.soft, fontFamily: font.sans(400) }}>Reference</Text>
            <Text style={{ fontFamily: font.mono(500), fontSize: 12.5, color: t.ink }}>CNV·8821·LP</Text>
          </View>
        </View>
        <Pressable onPress={() => router.replace('/home')} style={{ width: '100%', marginTop: 24, backgroundColor: t.ink, borderRadius: 18, paddingVertical: 17 }}>
          <Text style={{ color: t.canvas, textAlign: 'center', fontFamily: font.sans(700), fontSize: 16 }}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}
