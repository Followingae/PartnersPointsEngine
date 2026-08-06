import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AddCardTile, BrandCard, brandColor, brandInitials } from '@/components/BrandCard';
import { Body, EmptyState, ErrorState, H1, IconButton, Loading, Screen } from '@/components/UI';
import { getCards } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
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
  const { data: cards, loading, refreshing, error, signedOut, refresh } = useAsync(getCards, []);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const all = cards ?? [];

  return (
    <Screen background={C.surface} bottomGap={40} refreshing={refreshing} onRefresh={refresh}>
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

      {loading ? <Loading /> : null}

      {!loading && error && !cards ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && cards && all.length === 0 ? (
        <EmptyState
          title="No cards yet"
          body="Join a brand and it will show up here."
          actionLabel="Browse brands"
          onAction={() => router.push('/discover')}
        />
      ) : null}

      {all.length > 0 ? (
        <View style={{ marginTop: 26, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {all.map((c) => (
            <View key={c.membershipId} style={{ width: '48%' }}>
              <BrandCard
                size="tile"
                name={c.brandName}
                initial={brandInitials(c.brandName)}
                    branding={c.branding}
                color={brandColor(c.brandId, c.branding)}
                tier={c.tier ?? undefined}
                points={Number(c.available)}
                onPress={() => router.push(`/wallet/${c.brandId}`)}
              />
            </View>
          ))}
          <AddCardTile onPress={() => router.push('/discover')} style={{ width: '48%' }} />
        </View>
      ) : null}
    </Screen>
  );
}
