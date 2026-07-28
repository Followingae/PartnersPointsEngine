import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

function Bullet({ color, children }: { color: string; children: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />
      <Text style={{ fontSize: 13.5, color: t.soft }}>{children}</Text>
    </View>
  );
}

export default function Promo() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* hero */}
        <LinearGradient colors={['#070459', '#0B04D9', '#7A36D9']} locations={[0, 0.6, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ height: 300, paddingTop: insets.top + 8, paddingHorizontal: 24 }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
              <Path d="M6 6l12 12M18 6L6 18" />
            </Svg>
          </Pressable>
          <Text style={{ marginTop: 30, fontFamily: font.mono(600), fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: BRAND.lime }}>Limited · today only</Text>
          <Text style={{ fontFamily: font.display(700), fontSize: 48, lineHeight: 46, letterSpacing: -1, color: '#fff', marginTop: 10 }}>2× points{'\n'}happy hour</Text>
        </LinearGradient>

        {/* content */}
        <View style={{ paddingHorizontal: 24, paddingTop: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <LinearGradient colors={['#0B04D9', '#070459']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.display(800), fontSize: 16, color: '#fff' }}>CB</Text>
            </LinearGradient>
            <View>
              <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: t.ink }}>Camel Bean</Text>
              <Text style={{ fontSize: 12.5, color: t.soft }}>Thursday · 4:00–6:00 PM</Text>
            </View>
          </View>
          <Text style={{ marginTop: 20, fontSize: 15, lineHeight: 22, color: t.soft }}>
            Earn double points on every order during happy hour. Stack it with your Gold tier perks for an extra boost toward Black.
          </Text>
          <View style={{ marginTop: 20, gap: 10 }}>
            <Bullet color={BRAND.lime}>Applies in-store & on pickup orders</Bullet>
            <Bullet color={BRAND.blue}>All 6 branches · no code needed</Bullet>
          </View>
        </View>
      </ScrollView>

      {/* fixed CTA */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24 + insets.bottom, backgroundColor: t.canvas }}>
        <Pressable style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>Set a reminder</Text>
        </Pressable>
      </View>
    </View>
  );
}
