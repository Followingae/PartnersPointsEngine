import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button, Chip, EmptyState, ErrorState, IconButton, Label, Loading, Screen } from '@/components/UI';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { getDiscoverBrands } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, R, SP, T, font } from '@/lib/tokens';

/** 21 · Search & filters — live query, filter pills, results, sticky apply. */

/**
 * The design's pills (Near me, Open now, 2 pts / AED, Stamp cards) all need
 * data the brand list does not carry — no location, no earn rate, no stamp
 * programme. Membership is the one real axis, so it is the one kept.
 */
const FILTERS = ['Joined', 'To join'] as const;
type Filter = (typeof FILTERS)[number];

export default function DiscoverFilters() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Filter[]>([]);
  const { data, loading, error, signedOut, refresh } = useAsync(getDiscoverBrands);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const toggle = (f: Filter) =>
    setActive((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const q = query.trim().toLowerCase();
  // Both pills together mean "either", which is the same as neither.
  const wantJoined = active.includes('Joined');
  const wantOpen = active.includes('To join');
  const results = (data ?? []).filter((b) => {
    if (q && !b.brandName.toLowerCase().includes(q) && !b.brandSlug.toLowerCase().includes(q)) return false;
    if (wantJoined && !wantOpen) return b.joined;
    if (wantOpen && !wantJoined) return !b.joined;
    return true;
  });

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
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            placeholder="Search brands"
            placeholderTextColor={C.soft}
            style={[T.body, { flex: 1, padding: 0, fontSize: 14.5, lineHeight: 20, color: C.ink }]}
          />
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
        {loading ? (
          <Loading />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : results.length === 0 ? (
          <EmptyState title="No matches" body="Try a different name or clear the filters." />
        ) : (
          // The real list runs past the fold; the design only ever showed two.
          <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false}>
            {results.map((r, i) => {
              const tile = brandColor(r.brandId, r.branding);
              return (
                <Pressable
                  key={r.brandId}
                  onPress={() => router.push(`/merchant/${r.brandId}`)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline,
                    },
                    pressed ? { opacity: 0.75 } : null,
                  ]}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: tile, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: brandFg(tile) }}>{brandInitials(r.brandName)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{r.brandName}</Text>
                    <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 3 }}>{r.pointsCode}</Text>
                  </View>
                  {r.joined ? (
                    <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted }}>Joined</Text>
                  ) : (
                    <Pressable onPress={() => router.push(`/join/${r.brandId}`)} hitSlop={6}>
                      <Chip label="Join" tone="ink" style={{ paddingHorizontal: 14, paddingVertical: 9 }} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Search lives entirely on this screen, so the sticky action just closes
          it — there is no query to hand back to the Discover tab. */}
      <Button
        label={results.length === 1 ? 'Show 1 brand' : `Show ${results.length} brands`}
        onPress={() => router.back()}
        style={{ height: 58, borderRadius: 18 }}
      />
    </Screen>
  );
}
