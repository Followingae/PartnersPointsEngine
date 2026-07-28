import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import Svg, { Path } from 'react-native-svg';

export default function LinkSuccess() {
  const t = useTokens();
  const router = useRouter();
  const pop = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [pop]);

  return (
    <Screen scroll={false}>
      <View style={{ height: 46 }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 10 }}>
            <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 13l4 4 10-11" /></Svg>
          </LinearGradient>
        </Animated.View>
        <Text style={{ marginTop: 26, fontFamily: font.display(700), fontSize: 28, letterSpacing: -0.6, color: t.ink, textAlign: 'center' }}>Lulu account linked</Text>
        <Text style={{ marginTop: 12, fontSize: 15, color: t.soft, textAlign: 'center', fontFamily: font.sans(400) }}>You&apos;re ready to convert points whenever you like.</Text>
        <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 18, shadowColor: t.elevColor, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 1, shadowRadius: 20, elevation: 4 }}>
          <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.display(800), fontSize: 15, color: '#fff' }}>L</Text>
          </LinearGradient>
          <Text style={{ fontFamily: font.mono(600), fontSize: 14, color: t.soft }}>•••• 4821</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
        <Pressable onPress={() => router.replace('/convert')} style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontFamily: font.sans(700), fontSize: 16 }}>Start converting</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
