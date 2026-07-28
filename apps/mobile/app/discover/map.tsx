import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font, elevation } from '@/lib/tokens';

const PINS = [
  { top: 200, left: 70, size: 46, code: 'CB', color: BRAND.blue },
  { top: 300, left: 230, size: 40, code: 'OT', color: BRAND.coral },
  { top: 380, left: 130, size: 40, code: 'N', color: BRAND.purple },
];

export default function DiscoverMap() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cols = Array.from({ length: 11 }, (_, i) => i * 46);
  const rows = Array.from({ length: 20 }, (_, i) => i * 46);

  return (
    <View style={{ flex: 1, backgroundColor: t.map }}>
      {/* grid */}
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" viewBox="0 0 460 920" preserveAspectRatio="xMidYMid slice">
        {cols.map((x) => <Line key={`c${x}`} x1={x} y1={0} x2={x} y2={920} stroke={t.mapline} strokeWidth={1} />)}
        {rows.map((y) => <Line key={`r${y}`} x1={0} y1={y} x2={460} y2={y} stroke={t.mapline} strokeWidth={1} />)}
      </Svg>
      {/* roads */}
      <View style={{ position: 'absolute', top: '30%', left: '-10%', width: '130%', height: 14, backgroundColor: t.mapline, transform: [{ rotate: '18deg' }] }} />
      <View style={{ position: 'absolute', top: '62%', left: '-10%', width: '130%', height: 20, backgroundColor: t.mapline, transform: [{ rotate: '-10deg' }] }} />

      {/* top: back + search */}
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <BackButton fallback="/discover" />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13, ...elevation(t.elevColor) }}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2} strokeLinecap="round">
              <Circle cx={11} cy={11} r={7} />
              <Path d="M20 20l-3.2-3.2" />
            </Svg>
            <Text style={{ flex: 1, fontSize: 14, color: t.faint }}>Search this area</Text>
          </View>
        </View>
      </View>

      {/* pins */}
      {PINS.map((p) => (
        <View key={p.code} style={{ position: 'absolute', top: p.top, left: p.left, width: p.size, height: p.size, borderRadius: p.size / 2, borderBottomLeftRadius: 4, transform: [{ rotate: '-45deg' }], backgroundColor: p.color, alignItems: 'center', justifyContent: 'center', shadowColor: p.color, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 6 }}>
          <Text style={{ transform: [{ rotate: '45deg' }], fontFamily: font.display(800), fontSize: p.size > 42 ? 13 : 12, color: '#fff' }}>{p.code}</Text>
        </View>
      ))}

      {/* bottom card */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 18 + insets.bottom, backgroundColor: t.card, borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, ...elevation(t.elevColor) }}>
        <View style={{ width: 54, height: 54, borderRadius: 15, backgroundColor: BRAND.blue, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.display(800), fontSize: 18, color: '#fff' }}>CB</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.ink }}>Camel Bean · JLT</Text>
          <Text style={{ fontSize: 12, color: t.faint, marginTop: 2 }}>Open · closes 10 PM · 0.3 km</Text>
        </View>
        <Pressable onPress={() => router.push('/merchant/camel-bean')} style={{ backgroundColor: BRAND.blue, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: '#fff' }}>Open</Text>
        </Pressable>
      </View>
    </View>
  );
}
