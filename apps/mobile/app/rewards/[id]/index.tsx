import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { brandColor } from '@/components/BrandCard';
import { Body, Button, EmptyState, ErrorState, H1, Loading, Screen, Small, pts } from '@/components/UI';
import { C, R, font } from '@/lib/tokens';
import { Footer, Ic, TopBar } from '@/components/RewardKit';
import { affords, cost, shortfall, useRewards } from '../_data';

export default function RewardDetail() {
  const { id, brandId } = useLocalSearchParams<{ id: string; brandId?: string }>();
  const router = useRouter();
  const { data, loading, error, signedOut, refresh } = useRewards(brandId);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = data?.card;
  const reward = data?.rewards.find((r) => r.id === id);
  const color = card ? brandColor(card.brandId, card.branding) : C.orange;

  const canAfford = reward ? affords(card, reward) : false;
  const short = reward ? shortfall(card, reward) : 0;

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar />

      {loading ? <Loading /> : null}

      {!loading && error && !data ? <ErrorState message={error} onRetry={refresh} /> : null}

      {/* The catalogue is per brand, so a reward can disappear between screens. */}
      {!loading && data && !reward ? (
        <EmptyState
          title="Reward unavailable"
          body="This reward is no longer in the catalogue."
          actionLabel="Back to rewards"
          onAction={() => router.replace('/rewards')}
        />
      ) : null}

      {reward && card ? (
        <>
          <View style={{ paddingTop: 30, paddingBottom: 34, alignItems: 'center' }}>
            <Ic name="cup" size={64} color={color} sw={1.3} />
          </View>

          <H1 style={{ fontSize: 28, lineHeight: 34 }}>{reward.name}</H1>

          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: R.chip, backgroundColor: C.canvas }}>
              <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>
                {pts(cost(reward))} pts
              </Text>
            </View>
            <Small style={{ fontSize: 13.5, lineHeight: 19 }}>
              {canAfford
                ? `Balance after ${pts(Number(card.available) - cost(reward))}`
                : `${pts(short)} pts short`}
            </Small>
          </View>

          <Body tone="muted" style={{ marginTop: 20, fontSize: 14.5, lineHeight: 23 }}>
            {reward.description ?? `Redeem at ${card.brandName}. You will get a voucher code to show at the till.`}
          </Body>

          <Footer>
            <Button
              label={canAfford ? `Redeem ${pts(cost(reward))} pts` : `${pts(short)} pts to go`}
              disabled={!canAfford}
              onPress={() =>
                router.push({
                  pathname: '/rewards/[id]/redeem',
                  params: { id: reward.id, brandId: card.brandId },
                })
              }
            />
            {!canAfford ? (
              <Small style={{ marginTop: 12, textAlign: 'center', fontSize: 12.5, lineHeight: 18 }}>
                You have {pts(Number(card.available))} pts at {card.brandName}.
              </Small>
            ) : null}
          </Footer>
        </>
      ) : null}
    </Screen>
  );
}
