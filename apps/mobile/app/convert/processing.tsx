import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

function FlyingDot({ color, dx, size, delay }: { color: string; dx: number; size: number; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1500, delay, easing: Easing.in(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 84,
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -150] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
        ],
      }}
    />
  );
}

export default function ConvertProcessing() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    const tmr = setTimeout(() => router.replace('/convert/success'), 1900);
    return () => { loop.stop(); clearTimeout(tmr); };
  }, [spin, router]);

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,4,30,0.5)' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 56 + insets.bottom, alignItems: 'center' }}>
        <View style={{ width: 160, height: 170 }}>
          <FlyingDot color={BRAND.blue} dx={0} size={11} delay={0} />
          <FlyingDot color={BRAND.sky} dx={-34} size={9} delay={300} />
          <FlyingDot color={BRAND.purple} dx={34} size={9} delay={600} />
          <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: '50%', bottom: 0, marginLeft: -32, width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.display(800), fontSize: 26, color: '#fff' }}>L</Text>
          </LinearGradient>
          <Animated.View style={{ position: 'absolute', left: '50%', top: 0, marginLeft: -27, width: 54, height: 54, borderRadius: 27, borderWidth: 4, borderColor: t.line, borderTopColor: BRAND.blue, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }} />
        </View>
        <Text style={{ fontFamily: font.sans(700), fontSize: 18, color: t.ink, marginTop: 30 }}>Converting your points…</Text>
        <Text style={{ fontSize: 13, color: t.soft, marginTop: 6, fontFamily: font.sans(400) }}>Pooling 2,800 pts from 3 merchants → Lulu</Text>
      </View>
    </View>
  );
}
