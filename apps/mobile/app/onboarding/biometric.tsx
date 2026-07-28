import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import { PrimaryButton } from './_components';

export default function Biometric() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <View style={{ height: 46 }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <LinearGradient
            colors={[BRAND.sky, BRAND.blue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.5, shadowRadius: 28, elevation: 10 }}
          >
            <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
              <Path d="M9 10v1M15 10v1M9 15c.9.8 2.1 1.2 3 1.2s2.1-.4 3-1.2" />
            </Svg>
          </LinearGradient>
          <Text style={{ marginTop: 30, fontFamily: font.display(700), fontSize: 28, lineHeight: 29, letterSpacing: -0.6, textAlign: 'center', color: t.ink }}>Unlock instantly</Text>
          <Text style={{ marginTop: 12, fontFamily: font.sans(400), fontSize: 15, lineHeight: 21, textAlign: 'center', color: t.soft }}>
            Use Face ID to open Partners Points in a tap. You can use a PIN instead.
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <View style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: BRAND.blue }} />
            <View style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: BRAND.blue }} />
            <View style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: BRAND.blue }} />
            <View style={{ width: 14, height: 14, borderRadius: 999, borderWidth: 2, borderColor: t.faint }} />
          </View>
        </View>
        <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
          <PrimaryButton label="Enable Face ID" onPress={() => router.push('/onboarding/profiling')} />
          <Pressable onPress={() => router.push('/onboarding/profiling')} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.soft }}>Set up a PIN instead</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
