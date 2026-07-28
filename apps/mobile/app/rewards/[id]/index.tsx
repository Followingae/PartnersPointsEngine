import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

export default function RewardDetail() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen scroll={false} topInset={false}>
      {/* image header */}
      <View style={{ height: 280, backgroundColor: '#e3e3e6', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/rewards'))}
          style={{ position: 'absolute', top: insets.top + 6, left: 22, width: 36, height: 36, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', ...elevation(t.elevColor) }}
        >
          <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 5l-7 7 7 7" />
          </Svg>
        </Pressable>
        <Text style={{ fontFamily: font.mono(500), fontSize: 10, color: '#7a7a82', backgroundColor: 'rgba(255,255,255,0.82)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7 }}>reward image</Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.display(800), fontSize: 10, color: '#fff' }}>CB</Text>
          </LinearGradient>
          <Text style={{ fontSize: 13, color: t.soft }}>Camel Bean</Text>
        </View>
        <Text style={{ marginTop: 12, fontFamily: font.display(700), fontSize: 30, color: t.ink, letterSpacing: -0.6 }}>Free flat white</Text>
        <Text style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22, color: t.soft }}>
          Any size, any branch. Redeem in-store by showing the voucher at the till. One per visit.
        </Text>
        <Text style={{ marginTop: 16, fontSize: 13, color: t.soft }}>⏳ Voucher valid 30 days</Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 30 + insets.bottom }}>
        <Pressable
          onPress={() => router.push(`/rewards/${id}/redeem`)}
          style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 6 }}
        >
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>Redeem · </Text>
          <Text style={{ fontFamily: font.display(700), fontSize: 16, color: '#fff' }}>450 pts</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
