import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button, Chip, IconButton, Label, Screen } from '@/components/UI';
import { C, R, SP, font } from '@/lib/tokens';

/** 21 · Search & filters — live query, filter pills, results, sticky apply. */

const FILTERS = ['Near me', 'Open now', '2 pts / AED', 'Stamp cards', 'Joined'];

type Result = { id: string; code: string; name: string; meta: string; tile: string; fg: string; joined: boolean };

// TODO(api): GET /customer/discover/search?q={query}&filters={filters}
const RESULTS: Result[] = [
  { id: 'camel-bean', code: 'CB', name: 'Camel Bean', meta: 'Coffee · 0.4 km', tile: C.orange, fg: C.ink, joined: true },
  { id: 'bloom-coffee', code: 'BC', name: 'Bloom Coffee', meta: 'Coffee · 0.8 km', tile: C.blue, fg: '#fff', joined: false },
];

/** The design shows a blinking text caret sitting after the typed query. */
function Caret() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 530);
    return () => clearInterval(id);
  }, []);
  return <View style={{ width: 2, height: 18, marginBottom: -3, backgroundColor: on ? C.ink : 'transparent' }} />;
}

export default function DiscoverFilters() {
  const router = useRouter();
  const [active, setActive] = useState<string[]>(['Near me', 'Open now']);

  const toggle = (f: string) =>
    setActive((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  return (
    <Screen scroll={false} bottomGap={34} background={C.surface}>
      <View style={{ flex: 1 }}>
        <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center' }}>
          <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 5l-7 7 7 7" />
            </Svg>
          </IconButton>
        </View>

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 16,
            backgroundColor: C.canvas, borderRadius: R.tile, paddingHorizontal: 16, paddingVertical: 15,
          }}
        >
          <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="M20 20l-3.2-3.2" />
          </Svg>
          <Text style={{ fontFamily: font(500), fontSize: 14.5, color: C.ink }}>coff</Text>
          <Caret />
        </View>

        <Label style={{ marginTop: 26 }}>Filters</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.tight, marginTop: 14 }}>
          {FILTERS.map((f) => (
            <Pressable key={f} onPress={() => toggle(f)}>
              <Chip label={f} tone={active.includes(f) ? 'ink' : 'neutral'} style={{ paddingHorizontal: 15, paddingVertical: 9 }} />
            </Pressable>
          ))}
        </View>

        <Label style={{ marginTop: 30 }}>Results</Label>
        <View style={{ marginTop: 8 }}>
          {RESULTS.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/merchant/${r.id}`)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline,
                },
                pressed ? { opacity: 0.75 } : null,
              ]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: r.tile, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font(600), fontSize: 13, color: r.fg }}>{r.code}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 14.5, color: C.ink }}>{r.name}</Text>
                <Text style={{ fontFamily: font(500), fontSize: 12.5, color: C.muted, marginTop: 3 }}>{r.meta}</Text>
              </View>
              {r.joined ? (
                <Text style={{ fontFamily: font(500), fontSize: 12.5, color: C.muted }}>Joined</Text>
              ) : (
                <Pressable onPress={() => router.push(`/join/${r.id}`)} hitSlop={6}>
                  <Chip label="Join" tone="ink" style={{ paddingHorizontal: 14, paddingVertical: 9 }} />
                </Pressable>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      <Button label="Show 6 brands" onPress={() => router.back()} style={{ height: 58, borderRadius: 18 }} />
    </Screen>
  );
}
