import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { SettingsHeader } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

export default function LinkedPartners() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen>
      <SettingsHeader title="Linked partners" />
      <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
        <Text style={{ fontSize: 14, color: t.soft }}>Convert your points to partner programs.</Text>
      </View>

      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        {/* Lulu — linked */}
        <View style={[{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, padding: 18 }, elevation(t.elevColor)]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.display(800), fontSize: 20, color: '#fff' }}>L</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: t.ink }}>Lulu Happiness Points</Text>
              <Text style={{ fontFamily: font.mono(500), fontSize: 12.5, color: t.faint, marginTop: 2 }}>•••• 4821</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(191,242,5,0.24)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 11, color: '#4d5c00' }}>Linked</Text>
            </View>
          </View>
          <View style={{ marginTop: 16, flexDirection: 'row', gap: 11 }}>
            <Pressable onPress={() => router.push('/convert')} style={{ flex: 1, alignItems: 'center', backgroundColor: t.chip, borderRadius: 13, paddingVertical: 12 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: t.ink }}>Convert points</Text>
            </Pressable>
            <Pressable style={{ flex: 1, alignItems: 'center', borderWidth: 1, borderColor: t.line, borderRadius: 13, paddingVertical: 12 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: BRAND.coral }}>Unlink</Text>
            </Pressable>
          </View>
        </View>

        {/* more soon */}
        <View style={{ marginTop: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderStyle: 'dashed', borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13, opacity: 0.85 }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2} strokeLinecap="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.ink }}>More partners soon</Text>
            <Text style={{ fontSize: 12.5, color: t.soft }}>We&apos;re adding new programs to convert into.</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}
