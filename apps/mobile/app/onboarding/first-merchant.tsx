import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import { IllusChip, PrimaryButton, StripeOverlay } from './_components';

export default function FirstMerchant() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <View style={{ height: 46 }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <LinearGradient
            colors={[BRAND.blue, BRAND.purple]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ width: 170, height: 170, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: t.elevColor, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 1, shadowRadius: 22, elevation: 8 }}
          >
            <StripeOverlay />
            <IllusChip label="illustration" />
          </LinearGradient>
          <Text style={{ marginTop: 30, fontFamily: font.display(700), fontSize: 28, lineHeight: 29, letterSpacing: -0.6, textAlign: 'center', color: t.ink }}>Let&apos;s find your first merchant</Text>
          <Text style={{ marginTop: 12, fontFamily: font.sans(400), fontSize: 15, lineHeight: 21, textAlign: 'center', color: t.soft }}>Join a program to start earning points and unlocking rewards.</Text>
        </View>
        <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
          <PrimaryButton label="Browse merchants" onPress={() => router.replace('/discover')} />
          <Pressable
            onPress={() => router.replace('/scan')}
            style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, paddingVertical: 15, shadowColor: t.elevColor, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 1, shadowRadius: 20, elevation: 4 }}
          >
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={2} strokeLinecap="round">
              <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
              <Path d="M4 12h16" />
            </Svg>
            <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.ink }}>Scan in-store QR</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
