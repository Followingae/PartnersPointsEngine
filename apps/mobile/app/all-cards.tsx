import { useRouter } from 'expo-router';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AddCardTile, BrandCard, SAMPLE_BRANDS } from '@/components/BrandCard';
import { Body, H1, IconButton, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';

/** 11 · All cards — every membership as a half-width tile. */

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

function SortIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 6h16M7 12h10M10 18h4" />
    </Svg>
  );
}

export default function AllCards() {
  const router = useRouter();

  return (
    <Screen background={C.surface} bottomGap={40}>
      <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
        {/* TODO(api): sort + reorder persistence. */}
        <IconButton style={{ borderRadius: 999 }}>
          <SortIcon />
        </IconButton>
      </View>

      <View style={{ marginTop: 20 }}>
        <H1 style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>All cards</H1>
        <Body tone="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 20 }}>Hold and drag to reorder</Body>
      </View>

      <View style={{ marginTop: 26, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {/* TODO(api): the customer's full card list, in their saved order. */}
        {SAMPLE_BRANDS.map((b) => (
          <View key={b.id} style={{ width: '48%' }}>
            <BrandCard
              size="tile"
              name={b.name}
              initial={b.initial}
              color={b.color}
              tier={b.tier}
              points={b.points}
              onPress={() => router.push(`/wallet/${b.id}`)}
            />
          </View>
        ))}
        <AddCardTile onPress={() => router.push('/(tabs)/discover')} style={{ width: '48%' }} />
      </View>
    </Screen>
  );
}
