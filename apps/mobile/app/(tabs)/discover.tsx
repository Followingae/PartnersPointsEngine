import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Chip, H1, Screen } from '@/components/UI';
import { C, R, SP, font } from '@/lib/tokens';

/** 19 · Discover — search, category chips, joinable brands. */

const CATEGORIES = ['All', 'Coffee', 'Dining', 'Grocery'] as const;

type Brand = {
  id: string;
  code: string;
  name: string;
  meta: string;
  category: string;
  tile: string;
  fg: string;
  joined: boolean;
};

// TODO(api): GET /customer/discover?near={lat,lng}&category={category}
const BRANDS: Brand[] = [
  { id: 'camel-bean', code: 'CB', name: 'Camel Bean', meta: 'Coffee · 0.4 km · 1 pt / AED', category: 'Coffee', tile: C.orange, fg: C.ink, joined: true },
  { id: 'bloom-coffee', code: 'BC', name: 'Bloom Coffee', meta: 'Coffee · 0.8 km · 2 pts / AED', category: 'Coffee', tile: C.blue, fg: '#fff', joined: false },
  { id: 'olive-thyme', code: 'OT', name: 'Olive & Thyme', meta: 'Dining · 1.4 km · 1 pt / AED', category: 'Dining', tile: C.pink, fg: C.ink, joined: false },
  { id: 'nakheel-grocer', code: 'NG', name: 'Nakheel Grocer', meta: 'Grocery · 2.1 km · 1 pt / AED', category: 'Grocery', tile: C.lime, fg: C.ink, joined: false },
];

function BrandRow({ brand, onPress, onJoin }: { brand: Brand; onPress: () => void; onJoin: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14 }, pressed ? { opacity: 0.75 } : null]}
    >
      <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: brand.tile, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: brand.fg }}>{brand.code}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.ink }}>{brand.name}</Text>
        <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 3 }}>{brand.meta}</Text>
      </View>
      {brand.joined ? (
        <Chip label="Joined" tone="neutral" style={{ paddingHorizontal: 16, paddingVertical: 10 }} />
      ) : (
        <Pressable onPress={onJoin} hitSlop={6}>
          <Chip label="Join" tone="ink" style={{ paddingHorizontal: 16, paddingVertical: 10 }} />
        </Pressable>
      )}
    </Pressable>
  );
}

export default function DiscoverTab() {
  const router = useRouter();
  const [category, setCategory] = useState<string>('All');
  const list = category === 'All' ? BRANDS : BRANDS.filter((b) => b.category === category);

  return (
    <Screen background={C.surface}>
      <H1 style={{ marginTop: 16 }}>Discover</H1>

      <Pressable
        onPress={() => router.push('/discover/filters')}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 11,
          backgroundColor: C.canvas, borderRadius: R.tile,
          paddingHorizontal: 16, paddingVertical: 15, marginTop: 20,
        }}
      >
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx={11} cy={11} r={7} />
          <Path d="M20 20l-3.2-3.2" />
        </Svg>
        <Text style={{ flex: 1, fontFamily: font(500), fontSize: 14.5, lineHeight: 20, color: C.soft }}>Search brands</Text>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={1.9} strokeLinecap="round">
          <Path d="M4 6h16M7 12h10M10 18h4" />
        </Svg>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: SP.tight, marginTop: 16 }}>
        {CATEGORIES.map((c) => (
          <Pressable key={c} onPress={() => setCategory(c)}>
            <Chip label={c} tone={category === c ? 'ink' : 'neutral'} style={{ paddingHorizontal: 15, paddingVertical: 9 }} />
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 24, gap: 16 }}>
        {list.map((b) => (
          <BrandRow
            key={b.id}
            brand={b}
            onPress={() => router.push(`/merchant/${b.id}`)}
            onJoin={() => router.push(`/join/${b.id}`)}
          />
        ))}
      </View>

      <Pressable onPress={() => router.push('/discover/map')} style={{ marginTop: 26, alignSelf: 'flex-start' }}>
        <Chip label="Open map" tone="neutral" style={{ paddingHorizontal: 15, paddingVertical: 9 }} />
      </Pressable>
    </Screen>
  );
}
