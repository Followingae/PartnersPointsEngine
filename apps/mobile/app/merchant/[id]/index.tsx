import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTokens } from '@/lib/theme';
import { BRAND, font, elevation } from '@/lib/tokens';

export default function MerchantPreview() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* hero */}
        <LinearGradient colors={['#0B04D9', '#070459']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ height: 172, paddingTop: insets.top + 8, paddingHorizontal: 22 }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 5l-7 7 7 7" />
            </Svg>
          </Pressable>
        </LinearGradient>

        <View style={{ paddingHorizontal: 22, marginTop: -34 }}>
          <View style={{ width: 68, height: 68, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...elevation(t.elevColor) }}>
            <Text style={{ fontFamily: font.display(800), fontSize: 26, color: BRAND.blue }}>CB</Text>
          </View>
          <Text style={{ marginTop: 14, fontFamily: font.display(700), fontSize: 26, letterSpacing: -0.6, color: t.ink }}>Camel Bean</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <Text style={{ fontSize: 13, color: t.soft }}>☕ Specialty coffee</Text>
            <Text style={{ fontSize: 13, color: t.faint }}>·</Text>
            <Text style={{ fontSize: 13, color: t.soft }}>★ 4.8</Text>
            <Text style={{ fontSize: 13, color: t.faint }}>·</Text>
            <Text style={{ fontSize: 13, color: t.soft }}>6 branches</Text>
          </View>
          <View style={{ alignSelf: 'flex-start', marginTop: 14, backgroundColor: 'rgba(11,4,217,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
            <Text style={{ fontFamily: font.sans(700), fontSize: 11, color: BRAND.blue }}>✦ Lulu Awarding Merchant</Text>
          </View>
          <Text style={{ marginTop: 16, fontSize: 14.5, lineHeight: 22, color: t.soft }}>
            Small-batch roasters with six cafés across the city. Earn on every cup and redeem for free drinks & pastries.
          </Text>
          <View style={{ marginTop: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 15, ...elevation(t.elevColor) }}>
            <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: t.ink, marginBottom: 10 }}>What you earn</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: BRAND.lime }} />
              <Text style={{ fontSize: 13, color: t.soft }}>1 pt / AED · 2× happy hour Thursdays</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push(`/merchant/${id}/about`)} style={{ marginTop: 14, alignSelf: 'flex-start' }}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 13, color: BRAND.blue }}>About this merchant →</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* fixed CTA */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 24 + insets.bottom, backgroundColor: t.canvas }}>
        <Pressable onPress={() => router.push(`/join/${id}`)} style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>Join & create wallet</Text>
        </Pressable>
      </View>
    </View>
  );
}
