import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

const ELIGIBLE = '2,800';
const LULU_OUT = '560';
const MERCHANTS: [string, string, string, [string, string]][] = [
  ['CB', 'Camel Bean', '1,800', [BRAND.blue, BRAND.deep]],
  ['V', 'Verde Market', '600', [BRAND.sky, BRAND.blue]],
  ['N', 'Núr Pâtisserie', '400', [BRAND.purple, '#4A1E99']],
];

export default function ConvertSheet() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      {/* dimmed branded backdrop */}
      <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: 'absolute', top: insets.top + 14, left: 26, right: 26, opacity: 0.45 }}>
        <Image source={require('@/assets/pp-wordmark-light.png')} style={{ height: 26, width: 150, resizeMode: 'contain' }} />
        <Text style={{ marginTop: 30, fontSize: 12, color: '#fff', opacity: 0.85, fontFamily: font.sans(400) }}>Lulu-eligible across your wallets</Text>
        <Text style={{ fontFamily: font.display(700), fontSize: 56, lineHeight: 50, color: '#fff', marginTop: 6 }}>2,800</Text>
      </View>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,4,30,0.5)' }} />

      {/* bottom sheet */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '92%', backgroundColor: t.card, borderTopLeftRadius: 30, borderTopRightRadius: 30 }}>
        <View style={{ alignItems: 'center', paddingTop: 11 }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: t.line }} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 28 + insets.bottom }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: font.display(700), fontSize: 21, color: t.ink }}>Convert to Lulu</Text>
            <Pressable onPress={() => router.back()} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }} hitSlop={8}>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={t.soft} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
            </Pressable>
          </View>

          {/* destination */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, paddingVertical: 13, paddingHorizontal: 15, borderWidth: 1, borderColor: t.line, borderRadius: 18 }}>
            <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.display(800), fontSize: 18, color: '#fff' }}>L</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 14, color: t.ink }}>Lulu Happiness Points</Text>
              <Text style={{ fontFamily: font.mono(500), fontSize: 12, color: t.faint }}>•••• 4821 · Linked</Text>
            </View>
            <Text style={{ fontFamily: font.sans(600), fontSize: 11, color: BRAND.blue, backgroundColor: 'rgba(11,4,217,0.1)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 }}>✓ Linked</Text>
          </View>

          {/* aggregate eligible */}
          <View style={{ alignItems: 'center', marginTop: 22 }}>
            <Text style={{ fontSize: 12.5, color: t.soft, fontFamily: font.sans(400) }}>Eligible to convert</Text>
            <Text style={{ fontFamily: font.display(700), fontSize: 58, lineHeight: 58, letterSpacing: -1.7, color: t.ink, marginTop: 4 }}>{ELIGIBLE}</Text>
            <Text style={{ fontSize: 13, color: t.soft, marginTop: 4, fontFamily: font.sans(400) }}>points pooled from 3 merchants</Text>
          </View>

          {/* merchant breakdown */}
          <View style={{ marginTop: 18, borderWidth: 1, borderColor: t.line, borderRadius: 18, overflow: 'hidden' }}>
            {MERCHANTS.map(([initials, name, pts, grad], i) => (
              <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: i < 2 ? 1 : 0, borderColor: t.line }}>
                <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: font.display(800), fontSize: 11, color: '#fff' }}>{initials}</Text>
                </LinearGradient>
                <Text style={{ flex: 1, fontFamily: font.sans(600), fontSize: 13.5, color: t.ink }}>{name}</Text>
                <Text style={{ fontFamily: font.sans(700), fontSize: 13.5, color: t.ink }}>{pts}</Text>
              </View>
            ))}
          </View>

          {/* preview */}
          <View style={{ marginTop: 18, backgroundColor: 'rgba(11,4,217,0.06)', borderWidth: 1, borderColor: 'rgba(11,4,217,0.2)', borderRadius: 20, paddingVertical: 17, paddingHorizontal: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontFamily: font.display(700), fontSize: 22, color: t.ink }}>{ELIGIBLE}</Text>
                <Text style={{ fontSize: 11, color: t.soft, fontFamily: font.sans(400) }}>eligible pts</Text>
              </View>
              <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12h14M13 6l6 6-6 6" /></Svg>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontFamily: font.display(700), fontSize: 22, color: BRAND.blue }}>{LULU_OUT}</Text>
                <Text style={{ fontSize: 11, color: t.soft, fontFamily: font.sans(400) }}>Lulu Happiness</Text>
              </View>
            </View>
            <Text style={{ textAlign: 'center', marginTop: 11, fontFamily: font.mono(500), fontSize: 11, color: t.faint }}>5 pts = 1 LHP · no fee · instant</Text>
          </View>

          {/* TODO(api): previewConvert(eligible) for live preview; convert(eligible, key) on press */}
          <Pressable onPress={() => router.push('/convert/processing')} style={{ marginTop: 18, borderRadius: 18 }}>
            <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, paddingVertical: 17, shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 8 }}>
              <Text style={{ color: '#fff', textAlign: 'center', fontFamily: font.sans(700), fontSize: 16 }}>Convert all {ELIGIBLE} points</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}
