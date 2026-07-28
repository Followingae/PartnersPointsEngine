import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import Svg, { Path } from 'react-native-svg';

const STEPS: [string, string, string][] = [
  ['1', 'Link your Lulu account once', 'brand'],
  ['2', 'Convert all eligible points in a tap', 'brand'],
  ['3', 'Happiness Points land instantly', 'lime'],
];

export default function ConvertIntro() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/home" />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 54, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.display(800), fontSize: 18, color: '#fff' }}>PP</Text>
          </LinearGradient>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12h14M13 6l6 6-6 6" /></Svg>
          <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 54, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.display(800), fontSize: 22, color: '#fff' }}>L</Text>
          </LinearGradient>
        </View>
        <Text style={{ marginTop: 24, fontFamily: font.display(700), fontSize: 30, lineHeight: 32, letterSpacing: -0.6, color: t.ink }}>Turn your points into Lulu Happiness Points</Text>
        <Text style={{ marginTop: 12, fontSize: 15, color: t.soft, fontFamily: font.sans(400) }}>Pool eligible points from across your wallets and move them to Lulu — instantly.</Text>
        <View style={{ marginTop: 24, gap: 16 }}>
          {STEPS.map(([n, label, tone]) => (
            <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: tone === 'lime' ? 'rgba(191,242,5,0.3)' : 'rgba(11,4,217,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.display(800), fontSize: 13, color: tone === 'lime' ? '#4d5c00' : BRAND.blue }}>{n}</Text>
              </View>
              <Text style={{ fontSize: 14, color: t.ink, fontFamily: font.sans(400) }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
        <Pressable onPress={() => router.push('/convert/link')} style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontFamily: font.sans(700), fontSize: 16 }}>Link Lulu account</Text>
        </Pressable>
        <Text style={{ marginTop: 14, fontSize: 11.5, color: t.faint, textAlign: 'center', fontFamily: font.sans(400) }}>5 pts = 1 LHP · no fees · reversible</Text>
      </View>
    </Screen>
  );
}
