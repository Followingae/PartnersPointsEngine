import { useEffect } from 'react';
import { Image, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BRAND, font } from '@/lib/tokens';
import { PulseDot } from './_components';

export default function Splash() {
  const router = useRouter();
  useEffect(() => {
    const id = setTimeout(() => router.replace('/onboarding/carousel'), 2000);
    return () => clearTimeout(id);
  }, [router]);

  return (
    <LinearGradient colors={['#070459', '#05021c']} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {/* radial glow behind the wordmark */}
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="42%" rx="80%" ry="50%">
            <Stop offset="0%" stopColor={BRAND.blue} stopOpacity={0.4} />
            <Stop offset="60%" stopColor={BRAND.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
      </Svg>

      <Image source={require('@/assets/pp-wordmark-light.png')} resizeMode="contain" style={{ width: 238, height: 64 }} />
      <Text style={{ marginTop: 22, fontFamily: font.sans(400), fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Loyalty, simplified.</Text>

      <View style={{ position: 'absolute', bottom: 54, flexDirection: 'row', gap: 7 }}>
        <PulseDot color={BRAND.lime} delay={0} />
        <PulseDot color="rgba(255,255,255,0.6)" delay={200} />
        <PulseDot color="rgba(255,255,255,0.6)" delay={400} />
      </View>
    </LinearGradient>
  );
}
