import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import Svg, { Path, Rect } from 'react-native-svg';

export default function LinkLulu() {
  const t = useTokens();
  const router = useRouter();
  const caret = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 0, delay: 500, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 0, delay: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [caret]);

  function submit() {
    // TODO(api): linkPartner('lulu', cardNumber)
    router.push('/convert/linked');
  }

  return (
    <Screen scroll={false}>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/convert/intro" />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 14 }}>
        <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.display(800), fontSize: 24, color: '#fff' }}>L</Text>
        </LinearGradient>
        <Text style={{ marginTop: 18, fontFamily: font.display(700), fontSize: 28, lineHeight: 29, letterSpacing: -0.6, color: t.ink }}>Link your Lulu account</Text>
        <Text style={{ marginTop: 10, fontSize: 15, color: t.soft, fontFamily: font.sans(400) }}>Enter your Lulu card number or registered phone. We&apos;ll verify it with Lulu.</Text>
        <Text style={{ marginTop: 24, fontFamily: font.sans(600), fontSize: 12, color: t.soft }}>LULU CARD NUMBER</Text>
        <View style={{ marginTop: 8, backgroundColor: t.card, borderWidth: 2, borderColor: BRAND.blue, borderRadius: 16, height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: font.mono(600), fontSize: 17, letterSpacing: 1, color: t.ink }}>6035 •••• •••• 4821</Text>
          <Animated.View style={{ width: 2, height: 24, backgroundColor: BRAND.blue, marginLeft: 3, opacity: caret }} />
        </View>
        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={4} y={10} width={16} height={10} rx={2} /><Path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>
          <Text style={{ fontSize: 13, color: t.soft, fontFamily: font.sans(400) }}>Encrypted &amp; verified with Lulu directly</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
        <Pressable onPress={submit} style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontFamily: font.sans(700), fontSize: 16 }}>Verify &amp; link</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
