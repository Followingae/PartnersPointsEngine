import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getBrand } from '@/components/BrandCard';
import { Body, H1, IconButton, Screen, Small } from '@/components/UI';
import { C, font } from '@/lib/tokens';

/** 18 · Brand notifications — per-brand send permissions. */

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ width: 46, height: 28, borderRadius: 999, backgroundColor: on ? C.ink : C.wash, justifyContent: 'center' }}
    >
      <View
        style={{
          position: 'absolute', top: 3, left: on ? 21 : 3,
          width: 22, height: 22, borderRadius: 999, backgroundColor: '#fff',
          shadowColor: '#15150F', shadowOpacity: 0.18, shadowRadius: 5,
          shadowOffset: { width: 0, height: 2 }, elevation: 2,
        }}
      />
    </Pressable>
  );
}

type Pref = { key: string; title: string; sub: string; on: boolean };

// TODO(api): GET/PATCH /me/cards/:id/notification-preferences.
const PREFS: Pref[] = [
  { key: 'earned', title: 'Points earned', sub: 'After every visit', on: true },
  { key: 'rewards', title: 'Rewards ready', sub: 'When you can afford one', on: true },
  { key: 'expiring', title: 'Expiring points', sub: '14 days before', on: true },
  { key: 'offers', title: 'Offers', sub: 'Campaigns and happy hours', on: false },
];

export default function BrandNotifications() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brand = getBrand(id);
  const [prefs, setPrefs] = useState(PREFS);

  const toggle = (key: string) =>
    setPrefs((p) => p.map((x) => (x.key === key ? { ...x, on: !x.on } : x)));

  return (
    <Screen background={C.surface} bottomGap={40}>
      <View style={{ marginTop: 2 }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
      </View>

      <View style={{ marginTop: 20 }}>
        <H1 style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>{brand.name}</H1>
        <Body tone="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 20 }}>What this brand can send you</Body>
      </View>

      <View style={{ marginTop: 24 }}>
        {prefs.map((p, i) => (
          <View
            key={p.key}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{p.title}</Text>
              <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{p.sub}</Small>
            </View>
            <Toggle on={p.on} onPress={() => toggle(p.key)} />
          </View>
        ))}
      </View>
    </Screen>
  );
}
