import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { brandColor, brandFg, brandTint } from '@/components/BrandCard';
import {
  Card, Chip, EmptyState, ErrorState, H1, Label, Loading, Screen, Small, pts,
} from '@/components/UI';
import { Reward } from '@/lib/api';
import { C, R, T, font } from '@/lib/tokens';
import { Ic, ListRow, TopBar } from '@/components/RewardKit';
import { affords, cost, shortfall, useRewards } from './_data';

/** One of the tiles under "Everything else". */
function RewardTile({
  reward, brandId, color, locked,
}: { reward: Reward; brandId: string; color: string; locked: boolean }) {
  const router = useRouter();
  return (
    <Card
      onPress={() => router.push({ pathname: '/rewards/[id]', params: { id: reward.id, brandId } })}
      style={{ flex: 1, padding: 0, borderRadius: 22, overflow: 'hidden' }}
    >
      <View style={{ height: 76, backgroundColor: brandTint(color, 0.1), alignItems: 'center', justifyContent: 'center' }}>
        <Ic name="cup" size={34} color={color} sw={1.5} />
      </View>
      <View style={{ paddingHorizontal: 15, paddingTop: 14, paddingBottom: 16 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }} numberOfLines={2}>
          {reward.name}
        </Text>
        <Small style={{ marginTop: 4, fontSize: 12, lineHeight: 17 }} >
          {reward.description ?? (locked ? 'Keep earning' : 'Ready to redeem')}
        </Small>
        <Text style={{ marginTop: 12, fontFamily: font(600), fontSize: 13, lineHeight: 18, color: locked ? C.soft : C.ink }}>
          {pts(cost(reward))} pts
        </Text>
      </View>
    </Card>
  );
}

/** Tiles run two to a row; an odd count keeps the last tile at half width. */
function pairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

export default function Rewards() {
  const router = useRouter();
  const params = useLocalSearchParams<{ brandId?: string }>();
  const [brandId, setBrandId] = useState<string | undefined>(params.brandId);
  const [picking, setPicking] = useState(false);
  const { data, loading, refreshing, error, signedOut, refresh } = useRewards(brandId);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = data?.card;
  const cards = data?.cards ?? [];
  const rewards = data?.rewards ?? [];
  const color = card ? brandColor(card.brandId, card.branding) : C.orange;

  // The catalogue arrives cheapest-first. The hero is the dearest reward the
  // balance already covers; everything else keeps that order.
  const ready = rewards.filter((r) => affords(card, r));
  const hero = ready[ready.length - 1];
  const rest = rewards.filter((r) => r.id !== hero?.id);
  // The cheapest thing still out of reach — what there is left to save for.
  const nextUp = rewards.find((r) => !affords(card, r));

  return (
    <Screen background={C.surface} bottomGap={30} refreshing={refreshing} onRefresh={refresh}>
      <TopBar />

      <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <H1>Rewards</H1>
        {card ? (
          <Pressable
            onPress={cards.length > 1 ? () => setPicking((p) => !p) : undefined}
            style={({ pressed }) => [{ alignItems: 'flex-end' }, pressed ? { opacity: 0.6 } : null]}
          >
            <Text style={{ fontFamily: font(600), fontSize: 22, lineHeight: 27, letterSpacing: -0.66, color: C.ink }}>
              {pts(Number(card.available))}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Small style={{ fontSize: 12, lineHeight: 17 }}>pts at {card.brandName}</Small>
              {cards.length > 1 ? <Ic name="swap" size={12} color={C.soft} sw={2.2} /> : null}
            </View>
          </Pressable>
        ) : null}
      </View>

      {loading ? <Loading /> : null}

      {!loading && error && !data ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && data && !card ? (
        <EmptyState
          title="No cards yet"
          body="Join a brand and its rewards will show up here."
          actionLabel="Browse brands"
          onAction={() => router.push('/discover')}
        />
      ) : null}

      {/* Which card the points come out of. */}
      {picking && cards.length > 1 ? (
        <View style={{ marginTop: 12 }}>
          {cards.map((c, i) => (
            <ListRow
              key={c.membershipId}
              title={c.brandName}
              sub={c.brandId === card?.brandId ? 'Showing these rewards' : undefined}
              value={`${pts(Number(c.available))} pts`}
              divider={i > 0}
              onPress={() => {
                setBrandId(c.brandId);
                setPicking(false);
              }}
            />
          ))}
        </View>
      ) : null}

      {!picking && card && rewards.length === 0 && !loading && !error ? (
        <EmptyState
          title="No rewards yet"
          body={`${card.brandName} hasn’t published anything to redeem. Your points keep counting.`}
        />
      ) : null}

      {!picking && hero && card ? (
        <Pressable
          onPress={() => router.push({ pathname: '/rewards/[id]', params: { id: hero.id, brandId: card.brandId } })}
          style={({ pressed }) => [
            { marginTop: 22, borderRadius: R.sheet, backgroundColor: color, paddingVertical: 22, paddingHorizontal: 24 },
            pressed ? { opacity: 0.94 } : null,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label style={{ color: brandFg(color), letterSpacing: 1.3 }}>Ready now</Label>
            <Ic name="cup" size={26} color={brandFg(color)} sw={1.5} />
          </View>
          <Text style={{
            marginTop: 18, fontFamily: font(600), fontSize: 25, lineHeight: 28.5,
            letterSpacing: -0.75, color: brandFg(color), maxWidth: 220,
          }}>
            {hero.name}
          </Text>
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ ...T.body, fontSize: 13.5, lineHeight: 19, color: brandFg(color) }}>
              {pts(cost(hero))} pts · balance after {pts(Number(card.available) - cost(hero))}
            </Text>
            <Chip label="Redeem" tone="ink" style={{ paddingHorizontal: 16, paddingVertical: 10 }} />
          </View>
        </Pressable>
      ) : null}

      {!picking && card && rest.length > 0 ? (
        <>
          <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Label style={{ letterSpacing: 1.3 }}>Everything else</Label>
            <Small style={{ fontSize: 12.5, lineHeight: 18 }}>{rest.length}</Small>
          </View>

          {pairs(rest).map((row) => (
            <View key={row[0].id} style={{ marginTop: 16, flexDirection: 'row', gap: 12 }}>
              {row.map((r) => (
                <RewardTile
                  key={r.id}
                  reward={r}
                  brandId={card.brandId}
                  color={color}
                  locked={!affords(card, r)}
                />
              ))}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </>
      ) : null}

      {/* Next thing worth saving for. */}
      {!picking && card && nextUp ? (
        <Pressable
          onPress={() => router.push({ pathname: '/rewards/[id]', params: { id: nextUp.id, brandId: card.brandId } })}
          style={({ pressed }) => [
            {
              marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 14,
              paddingVertical: 16, paddingHorizontal: 18, borderRadius: 20, backgroundColor: C.canvas,
            },
            pressed ? { opacity: 0.7 } : null,
          ]}
        >
          <Ic name="gift" size={22} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }} numberOfLines={2}>
              {pts(shortfall(card, nextUp))} pts to {nextUp.name}
            </Text>
            <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>
              {pts(cost(nextUp))} pts in total
            </Small>
          </View>
          <Ic name="right" size={17} color={C.soft} sw={2} />
        </Pressable>
      ) : null}
    </Screen>
  );
}
