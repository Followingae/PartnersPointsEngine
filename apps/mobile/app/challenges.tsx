import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

const CHALLENGES: { emoji: string; bg: string; title: string; meta: string; pts: string; pct: number; grad: [string, string] }[] = [
  { emoji: '📅', bg: 'rgba(11,4,217,0.1)', title: 'Visit 5× this month', meta: 'Camel Bean · 3 of 5 visits', pts: '+200', pct: 60, grad: [BRAND.blue, BRAND.sky] },
  { emoji: '🔁', bg: 'rgba(191,242,5,0.22)', title: 'Convert to Lulu twice', meta: '1 of 2 conversions', pts: '+150', pct: 50, grad: ['#9ac400', BRAND.lime] },
  { emoji: '🌅', bg: 'rgba(122,54,217,0.16)', title: '3 morning orders', meta: 'Before 9 AM · 2 of 3', pts: '+100', pct: 66, grad: [BRAND.purple, '#9d6bff'] },
];

export default function Challenges() {
  const t = useTokens();
  return (
    <Screen>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/home" />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, letterSpacing: -0.5, color: t.ink }}>Challenges</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: t.soft, fontFamily: font.sans(400) }}>Complete these to earn bonus points.</Text>
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 14 }}>
        {CHALLENGES.map((c) => (
          <View key={c.title} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 17, shadowColor: t.elevColor, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 1, shadowRadius: 22, elevation: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.ink }}>{c.title}</Text>
                <Text style={{ fontSize: 12.5, color: t.soft, fontFamily: font.sans(400) }}>{c.meta}</Text>
              </View>
              <Text style={{ fontFamily: font.display(700), fontSize: 13, color: '#4d5c00' }}>{c.pts}</Text>
            </View>
            <View style={{ marginTop: 14, height: 8, borderRadius: 999, backgroundColor: t.chip, overflow: 'hidden' }}>
              <LinearGradient colors={c.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${c.pct}%` as `${number}%`, height: '100%', borderRadius: 999 }} />
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
