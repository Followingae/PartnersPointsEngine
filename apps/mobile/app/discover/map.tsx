import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { IconButton } from '@/components/UI';
import { C, R, SP, font, shadow } from '@/lib/tokens';

/** 20 · Map — pins over the canvas, floating search, selected-branch card. */

type Pin = { code: string; left: `${number}%`; top: `${number}%`; tile: string; fg: string };

// TODO(api): GET /customer/discover/map?bbox=…
const PINS: Pin[] = [
  { code: 'CB', left: '20%', top: '26%', tile: C.orange, fg: C.ink },
  { code: 'BC', left: '58%', top: '38%', tile: C.blue, fg: '#fff' },
  { code: 'OT', left: '34%', top: '58%', tile: C.pink, fg: C.ink },
  { code: 'V', left: '70%', top: '64%', tile: C.green, fg: C.ink },
];

const PIN = 44;

export default function DiscoverMap() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      {PINS.map((p) => (
        <View
          key={p.code}
          style={{
            position: 'absolute', left: p.left, top: p.top,
            marginLeft: -PIN / 2, marginTop: -PIN / 2,
            width: PIN, height: PIN, borderRadius: R.tile,
            backgroundColor: p.tile, alignItems: 'center', justifyContent: 'center',
            ...shadow.raised,
          }}
        >
          <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: p.fg }}>{p.code}</Text>
        </View>
      ))}

      {/* Back sits alongside the search field — the design reaches this view from
          the Discover tab, but here it is a pushed route and needs a way out. */}
      <View style={{ position: 'absolute', left: SP.gutter, right: SP.gutter, top: insets.top + 12, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <IconButton onPress={() => router.back()} style={{ backgroundColor: C.surface, borderRadius: 999, ...shadow.card }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 5l-7 7 7 7" />
          </Svg>
        </IconButton>
        <View
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11,
            backgroundColor: C.surface, borderRadius: R.tile,
            paddingHorizontal: 16, paddingVertical: 15, ...shadow.card,
          }}
        >
          <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="M20 20l-3.2-3.2" />
          </Svg>
          <Text style={{ flex: 1, fontFamily: font(500), fontSize: 14.5, lineHeight: 20, color: C.soft }}>Search this area</Text>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
            <Circle cx={12} cy={10} r={2.5} />
          </Svg>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/merchant/camel-bean')}
        style={({ pressed }) => [
          {
            position: 'absolute', left: SP.gutter, right: SP.gutter, bottom: 28 + insets.bottom,
            backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18,
            flexDirection: 'row', alignItems: 'center', gap: 14, ...shadow.card,
          },
          pressed ? { opacity: 0.9 } : null,
        ]}
      >
        <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }}>CB</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.ink }}>Camel Bean · JLT</Text>
          <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 3 }}>Open until 11 PM · 0.4 km</Text>
        </View>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 5l7 7-7 7" />
        </Svg>
      </Pressable>
    </View>
  );
}
