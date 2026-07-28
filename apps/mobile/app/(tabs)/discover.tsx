import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font, elevation } from '@/lib/tokens';

const CHIPS = ['Nearby', 'Featured', 'Categories'];

const LIST = [
  { id: 'olive-thyme', code: 'OT', name: 'Olive & Thyme', sub: 'Dining · 0.4 km', lulu: true, colors: ['#F2622E', '#c94512'], cta: 'Join' },
  { id: 'bloom-coffee', code: 'BC', name: 'Bloom Coffee', sub: 'Coffee · 0.8 km', lulu: false, colors: ['#070459', '#0B04D9'], cta: 'Join' },
  { id: 'kasa-home', code: 'KH', name: 'Kasa Home', sub: 'Home · 1.2 km', lulu: true, colors: ['#1B78F2', '#0B04D9'], cta: 'View' },
];

export default function DiscoverTab() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen pad>
      <View style={{ paddingHorizontal: 22, paddingTop: 4 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, color: t.ink, letterSpacing: -0.6 }}>Discover</Text>
      </View>

      {/* search */}
      <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 14, ...elevation(t.elevColor) }}>
          <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="M20 20l-3.2-3.2" />
          </Svg>
          <Text style={{ flex: 1, fontSize: 14.5, color: t.faint }}>Search cafés, shops & brands</Text>
        </View>
      </View>

      {/* chips */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 2 }}>
        {CHIPS.map((c, i) => (
          <Pressable key={c} onPress={() => i === 2 && router.push('/discover/map')} style={{ backgroundColor: i === 0 ? BRAND.blue : t.chip, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999 }}>
            <Text style={{ fontFamily: font.sans(i === 0 ? 700 : 600), fontSize: 12.5, color: i === 0 ? '#fff' : t.ink }}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {/* Lulu banner */}
      <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <Pressable onPress={() => router.push('/discover/map')}>
          <LinearGradient colors={['#070459', '#0B04D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 18, ...elevation(t.elevColor) }}>
            <Text style={{ fontFamily: font.mono(600), fontSize: 10.5, letterSpacing: 1.3, color: BRAND.lime, textTransform: 'uppercase' }}>Convert to Lulu</Text>
            <Text style={{ fontFamily: font.display(700), fontSize: 17, color: '#fff', marginTop: 6, maxWidth: 220 }}>Lulu Awarding Merchants near you</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 10 }}>12 partners turn points into Happiness Points</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* list */}
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 12 }}>
        {LIST.map((m) => (
          <Pressable key={m.id} onPress={() => router.push(`/merchant/${m.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 14, ...elevation(t.elevColor) }}>
            <LinearGradient colors={m.colors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.display(800), fontSize: 16, color: '#fff' }}>{m.code}</Text>
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ fontFamily: font.sans(700), fontSize: 14.5, color: t.ink }}>{m.name}</Text>
                {m.lulu ? (
                  <View style={{ backgroundColor: 'rgba(11,4,217,0.1)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                    <Text style={{ fontFamily: font.sans(700), fontSize: 9.5, color: BRAND.blue }}>✦ Lulu</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 12, color: t.faint, marginTop: 2 }}>{m.sub}</Text>
            </View>
            <Pressable onPress={() => router.push(m.cta === 'Join' ? `/join/${m.id}` : `/merchant/${m.id}`)} style={{ backgroundColor: m.cta === 'Join' ? BRAND.blue : t.chip, paddingHorizontal: 17, paddingVertical: 10, borderRadius: 999 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 12.5, color: m.cta === 'Join' ? '#fff' : t.ink }}>{m.cta}</Text>
            </Pressable>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
