import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import { PrimaryButton } from './_components';

function Avatar({ colors, label, first }: { colors: [string, string]; label: string; first?: boolean }) {
  const t = useTokens();
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: t.canvas, marginLeft: first ? 0 : -10 }}
    >
      <Text style={{ fontFamily: font.display(800), fontSize: 18, color: '#fff' }}>{label}</Text>
    </LinearGradient>
  );
}

export default function AccountFound() {
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
            style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.5, shadowRadius: 28, elevation: 10 }}
          >
            <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 13l4 4 10-11" />
            </Svg>
          </LinearGradient>
          <Text style={{ marginTop: 28, fontFamily: font.display(700), fontSize: 30, lineHeight: 31, letterSpacing: -0.6, textAlign: 'center', color: t.ink }}>Welcome back, Maya 👋</Text>
          <Text style={{ marginTop: 12, fontFamily: font.sans(400), fontSize: 15, lineHeight: 21, textAlign: 'center', color: t.soft }}>We found 3 wallets already linked to your number.</Text>
          <View style={{ flexDirection: 'row', marginTop: 24 }}>
            <Avatar colors={[BRAND.blue, '#070459']} label="CB" first />
            <Avatar colors={[BRAND.purple, '#4A1E99']} label="N" />
            <Avatar colors={[BRAND.sky, BRAND.blue]} label="V" />
          </View>
        </View>
        <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
          <PrimaryButton label="Go to my wallets" onPress={() => router.replace('/home')} />
        </View>
      </View>
    </Screen>
  );
}
