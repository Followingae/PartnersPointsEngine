import { useEffect } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button, EmptyState, ErrorState, Label, Loading, Screen, pts } from '@/components/UI';
import { AddToWallet } from '@/components/AddToWallet';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { getCards, getDiscoverBrands, getRewards, type Card, type DiscoverBrand, type Reward } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, R, SP, font } from '@/lib/tokens';

/** 22 · Brand storefront — coloured brand header over a plain benefits list. */

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

interface Storefront {
  brand: DiscoverBrand | undefined;
  card: Card | undefined;
  rewards: Reward[];
}

export default function MerchantStorefront() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const brandId = one(useLocalSearchParams<{ id: string }>().id);

  const { data, loading, error, signedOut, refresh } = useAsync<Storefront>(async () => {
    const [brands, cards] = await Promise.all([getDiscoverBrands(), getCards()]);
    const brand = brands.find((b) => b.brandId === brandId);
    const card = cards.find((c) => c.brandId === brandId);
    // Rewards are brand-scoped and need a card: a brand token can only be minted
    // for a membership, so a brand nobody has joined shows no reward list.
    const rewards = card ? await getRewards(card.brandId).catch(() => [] as Reward[]) : [];
    return { brand, card, rewards };
  }, [brandId]);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  if (loading) {
    return <Screen><Loading /></Screen>;
  }
  if (error && !data) {
    return <Screen><ErrorState message={error} onRetry={refresh} /></Screen>;
  }

  const { brand, card, rewards = [] } = data ?? ({} as Storefront);
  const name = brand?.brandName ?? card?.brandName;
  if (!name || !brandId) {
    return (
      <Screen>
        <EmptyState
          title="Brand not found"
          body="It may have left Partners Points."
          actionLabel="Back to Discover"
          onAction={() => router.replace('/discover')}
        />
      </Screen>
    );
  }

  const branding = brand?.branding ?? card?.branding;
  const tone = brandColor(brandId, branding);
  const onTone = brandFg(tone);
  const pointsCode = brand?.pointsCode ?? card?.pointsCode ?? 'points';
  const joined = Boolean(card);

  const circle = {
    width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.18)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={{ backgroundColor: tone, paddingTop: insets.top + 2, paddingBottom: 28 }}>
        <View style={{ paddingHorizontal: SP.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/discover'))} style={circle}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={onTone} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 5l-7 7 7 7" />
            </Svg>
          </Pressable>
          {/* No deep link to a storefront yet, so this shares the invitation itself. */}
          <Pressable
            onPress={() => {
              void Share.share({ message: `${name} is on Partners Points — collect ${pointsCode} every time you pay.` });
            }}
            style={circle}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={onTone} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 16V4M8 8l4-4 4 4" />
              <Path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
            </Svg>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: SP.gutter, marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <View style={{ width: 52, height: 52, borderRadius: R.tile, backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font(600), fontSize: 17, lineHeight: 24, color: onTone }}>{brandInitials(name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 19, lineHeight: 23, letterSpacing: -0.38, color: onTone }}>{name}</Text>
            <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: onTone, marginTop: 2 }}>
              {joined ? `${pts(Number(card!.available))} ${pointsCode}` : `Earn ${pointsCode}`}
            </Text>
          </View>
        </View>

        <Text style={{ paddingHorizontal: SP.gutter, marginTop: 26, fontFamily: font(500), fontSize: 14.5, lineHeight: 22.5, color: onTone }}>
          {joined
            ? `You’ve been a member since ${new Date(card!.joinedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}.`
            : `Join to start collecting ${pointsCode} every time you pay.`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: SP.gutter, paddingTop: 26, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        <Label>What you get</Label>
        {rewards.length === 0 ? (
          <Text style={{ marginTop: 14, fontFamily: font(500), fontSize: 14.5, lineHeight: 22.5, color: C.muted }}>
            {joined
              ? 'This brand has no rewards published right now.'
              : 'Rewards show up here once you join.'}
          </Text>
        ) : (
          <View style={{ marginTop: 8 }}>
            {rewards.map((r, i) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/rewards/${r.id}?brandId=${brandId}`)}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline,
                  },
                  pressed ? { opacity: 0.7 } : null,
                ]}
              >
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.canvas, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: font(600), fontSize: 12, lineHeight: 17, color: C.ink }}>{brandInitials(r.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{r.name}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 3 }}>
                    {r.description ?? `${pts(Number(r.pointsCost))} ${pointsCode}`}
                  </Text>
                </View>
                <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>{pts(Number(r.pointsCost))}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Only for a card actually held — there is nothing to add otherwise. */}
        {joined && card ? <AddToWallet membershipId={card.membershipId} /> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button
          label={joined ? `Open ${name}` : `Join ${name}`}
          onPress={() => router.push(joined ? `/wallet/${brandId}` : `/join/${brandId}`)}
          style={{ height: 58, borderRadius: 18, backgroundColor: tone }}
        />
      </View>
    </View>
  );
}
