import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Chip, EmptyState, ErrorState, H1, Loading, Screen } from '@/components/UI';
import { brandFg } from '@/components/BrandCard';
import { getDiscoverBrands, type DiscoverBrand } from '@/lib/api';
import { brandColor, brandInitials } from '@/lib/brand';
import { useAsync } from '@/lib/useAsync';
import { C, R, SP, font } from '@/lib/tokens';

/** 19 · Discover — search, filter chips, joinable brands. */

/**
 * The design filtered by category, but a brand carries no category (or location)
 * in the API — the only axis the data supports is whether the card is already
 * held, which is also the distinction that changes what tapping a row does.
 */
const FILTERS = ['All', 'In your wallet', 'To join'] as const;
type Filter = (typeof FILTERS)[number];

function BrandRow({ brand, onPress, onJoin }: { brand: DiscoverBrand; onPress: () => void; onJoin: () => void }) {
  const tile = brandColor(brand.branding, brand.brandId);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14 }, pressed ? { opacity: 0.75 } : null]}
    >
      <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: tile, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: brandFg(tile) }}>{brandInitials(brand.brandName)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.ink }}>{brand.brandName}</Text>
        <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 3 }}>
          {brand.joined ? `Earning ${brand.pointsCode}` : `Earn ${brand.pointsCode}`}
        </Text>
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
  const [filter, setFilter] = useState<Filter>('All');
  const { data, loading, refreshing, error, signedOut, refresh } = useAsync(getDiscoverBrands);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const brands = data ?? [];
  const list = brands.filter((b) =>
    filter === 'All' ? true : filter === 'In your wallet' ? b.joined : !b.joined,
  );

  return (
    <Screen background={C.surface} refreshing={refreshing} onRefresh={refresh}>
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
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)}>
            <Chip label={f} tone={filter === f ? 'ink' : 'neutral'} style={{ paddingHorizontal: 15, paddingVertical: 9 }} />
          </Pressable>
        ))}
      </View>

      {loading ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : list.length === 0 ? (
        <EmptyState
          title={brands.length === 0 ? 'No brands yet' : 'Nothing under this filter'}
          body={
            brands.length === 0
              ? 'New brands appear here as they join Partners Points.'
              : 'Try another filter to see the rest.'
          }
          {...(brands.length > 0 ? { actionLabel: 'Show all', onAction: () => setFilter('All') } : {})}
        />
      ) : (
        <View style={{ marginTop: 24, gap: 16 }}>
          {list.map((b) => (
            <BrandRow
              key={b.brandId}
              brand={b}
              onPress={() => router.push(`/merchant/${b.brandId}`)}
              onJoin={() => router.push(`/join/${b.brandId}`)}
            />
          ))}
        </View>
      )}

      <Pressable onPress={() => router.push('/discover/map')} style={{ marginTop: 26, alignSelf: 'flex-start' }}>
        <Chip label="Open map" tone="neutral" style={{ paddingHorizontal: 15, paddingVertical: 9 }} />
      </Pressable>
    </Screen>
  );
}
