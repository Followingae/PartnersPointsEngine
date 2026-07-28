import { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button, Label } from '@/components/UI';
import { C, R, SP, font } from '@/lib/tokens';

/** 22 · Brand storefront — coloured brand header over a plain benefits list. */

type Benefit = { icon: ReactNode; title: string; sub: string };
type Merchant = { code: string; name: string; meta: string; blurb: string; tone: string; fg: string; benefits: Benefit[] };

const ICON = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: C.ink, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const BENEFITS: Benefit[] = [
  {
    icon: <Svg {...ICON}><Path d="M12 5v14M5 12h14" /></Svg>,
    title: '2 pts per AED',
    sub: 'Every branch, every drink',
  },
  {
    icon: <Svg {...ICON}><Path d="M5 6h11v6a5.5 5.5 0 0 1-11 0z" /><Path d="M16 8h2.5a2.5 2.5 0 0 1 0 5H16M4 20h13" /></Svg>,
    title: 'Free drink at 300 pts',
    sub: 'About six visits',
  },
  {
    icon: <Svg {...ICON}><Path d="M12 4l2.3 4.9 5.2.6-3.8 3.6 1 5.3L12 15.8 7.3 18.4l1-5.3L4.5 9.5l5.2-.6z" /></Svg>,
    title: 'Stamp card',
    sub: 'Nine coffees, tenth free',
  },
];

// TODO(api): GET /customer/merchants/{id}
const MERCHANTS: Record<string, Merchant> = {
  'bloom-coffee': {
    code: 'BC', name: 'Bloom Coffee', meta: 'Coffee · 4 branches · 0.8 km', tone: C.blue, fg: '#fff',
    blurb: 'Small-batch roasters in Dubai since 2019. Earn 2 pts per AED, redeem from 300.',
    benefits: BENEFITS,
  },
  'camel-bean': {
    code: 'CB', name: 'Camel Bean', meta: 'Coffee · 9 branches · 0.4 km', tone: C.orange, fg: C.ink,
    blurb: 'Roasted in Al Quoz, poured across the city. Earn 1 pt per AED, redeem from 250.',
    benefits: BENEFITS,
  },
};

const FALLBACK = MERCHANTS['bloom-coffee'] as Merchant;

export default function MerchantStorefront() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = (id ? MERCHANTS[id] : undefined) ?? FALLBACK;
  const onTone = m.fg;

  const circle = {
    width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.18)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={{ backgroundColor: m.tone, paddingTop: insets.top + 2, paddingBottom: 28 }}>
        <View style={{ paddingHorizontal: SP.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} style={circle}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={onTone} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 5l-7 7 7 7" />
            </Svg>
          </Pressable>
          {/* TODO(api): share a deep link to this storefront */}
          <Pressable style={circle}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={onTone} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 16V4M8 8l4-4 4 4" />
              <Path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
            </Svg>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: SP.gutter, marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <View style={{ width: 52, height: 52, borderRadius: R.tile, backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font(600), fontSize: 17, color: onTone }}>{m.code}</Text>
          </View>
          <View>
            <Text style={{ fontFamily: font(600), fontSize: 19, letterSpacing: -0.38, color: onTone }}>{m.name}</Text>
            <Text style={{ fontFamily: font(500), fontSize: 12.5, color: onTone, marginTop: 2 }}>{m.meta}</Text>
          </View>
        </View>

        <Text style={{ paddingHorizontal: SP.gutter, marginTop: 26, fontFamily: font(500), fontSize: 14.5, lineHeight: 22.5, color: onTone }}>
          {m.blurb}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: SP.gutter, paddingTop: 26, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        <Label>What you get</Label>
        <View style={{ marginTop: 8 }}>
          {m.benefits.map((b, i) => (
            <View
              key={b.title}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline,
              }}
            >
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.canvas, alignItems: 'center', justifyContent: 'center' }}>
                {b.icon}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: font(600), fontSize: 14.5, color: C.ink }}>{b.title}</Text>
                <Text style={{ fontFamily: font(500), fontSize: 12.5, color: C.muted, marginTop: 3 }}>{b.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button
          label={`Join ${m.name}`}
          onPress={() => router.push(`/join/${id ?? 'bloom-coffee'}`)}
          style={{ height: 58, borderRadius: 18, backgroundColor: m.tone }}
        />
      </View>
    </View>
  );
}
