import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { IconButton, Loading, Small } from '@/components/UI';
import { brandFg } from '@/components/BrandCard';
import { getDiscoverBrands } from '@/lib/api';
import { brandColor, brandInitials } from '@/lib/brand';
import { useAsync } from '@/lib/useAsync';
import { C, R, SP, font, shadow } from '@/lib/tokens';

/**
 * 20 · Map — pins over the canvas, floating search, selected-brand card.
 *
 * This screen stays presentational. The brands and their colours are real, but
 * the API exposes no branch locations — `GET /customer/wallet/brands` returns
 * identity and membership only — so there is nothing to place on a map. Rather
 * than invent coordinates, the pins are laid out on a fixed decorative grid and
 * only the identities behind them are live. Wire a real map view here once the
 * API serves branches with lat/lng.
 */

/** Decorative pin positions — layout, not geography. */
const SLOTS: { left: `${number}%`; top: `${number}%` }[] = [
  { left: '20%', top: '26%' },
  { left: '58%', top: '38%' },
  { left: '34%', top: '58%' },
  { left: '70%', top: '64%' },
];

const PIN = 44;

export default function DiscoverMap() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, loading } = useAsync(getDiscoverBrands);
  const [selected, setSelected] = useState(0);

  const brands = (data ?? []).slice(0, SLOTS.length);
  const current = brands[Math.min(selected, Math.max(0, brands.length - 1))];

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      {brands.map((b, i) => {
        const tile = brandColor(b.branding, b.brandId);
        return (
          <Pressable
            key={b.brandId}
            onPress={() => setSelected(i)}
            style={{
              position: 'absolute', left: SLOTS[i]!.left, top: SLOTS[i]!.top,
              marginLeft: -PIN / 2, marginTop: -PIN / 2,
              width: PIN, height: PIN, borderRadius: R.tile,
              backgroundColor: tile, alignItems: 'center', justifyContent: 'center',
              ...shadow.raised,
            }}
          >
            <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: brandFg(tile) }}>
              {brandInitials(b.brandName)}
            </Text>
          </Pressable>
        );
      })}

      {/* Back sits alongside the search field — the design reaches this view from
          the Discover tab, but here it is a pushed route and needs a way out. */}
      <View style={{ position: 'absolute', left: SP.gutter, right: SP.gutter, top: insets.top + 12, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <IconButton onPress={() => router.back()} style={{ backgroundColor: C.surface, borderRadius: 999, ...shadow.card }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 5l-7 7 7 7" />
          </Svg>
        </IconButton>
        <Pressable
          onPress={() => router.push('/discover/filters')}
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
          <Text style={{ flex: 1, fontFamily: font(500), fontSize: 14.5, lineHeight: 20, color: C.soft }}>Search brands</Text>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
            <Circle cx={12} cy={10} r={2.5} />
          </Svg>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><Loading /></View>
      ) : null}

      {current ? (
        <Pressable
          onPress={() => router.push(`/merchant/${current.brandId}`)}
          style={({ pressed }) => [
            {
              position: 'absolute', left: SP.gutter, right: SP.gutter, bottom: 28 + insets.bottom,
              backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18,
              flexDirection: 'row', alignItems: 'center', gap: 14, ...shadow.card,
            },
            pressed ? { opacity: 0.9 } : null,
          ]}
        >
          <View
            style={{
              width: 46, height: 46, borderRadius: 15,
              backgroundColor: brandColor(current.branding, current.brandId),
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: brandFg(brandColor(current.branding, current.brandId)) }}>
              {brandInitials(current.brandName)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.ink }}>{current.brandName}</Text>
            <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 3 }}>
              {current.joined ? `In your wallet · ${current.pointsCode}` : `Earn ${current.pointsCode}`}
            </Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 5l7 7-7 7" />
          </Svg>
        </Pressable>
      ) : !loading ? (
        <View style={{ position: 'absolute', left: SP.gutter, right: SP.gutter, bottom: 28 + insets.bottom, alignItems: 'center' }}>
          <Small>No brands to show yet.</Small>
        </View>
      ) : null}
    </View>
  );
}
