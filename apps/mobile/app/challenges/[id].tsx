import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { BackBar, Icon, Lede, ListRow, Segments, Tile } from '@/components/Bits';
import { Confetti } from '@/components/Confetti';
import { brandColor } from '@/components/BrandCard';
import { Button, ErrorState, H1, Label, Loading, Screen, Small } from '@/components/UI';
import { getCards, getChallenges } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, R, font } from '@/lib/tokens';

/** 44 · One challenge, with where the member has got to. */
export default function ChallengeDetail() {
  const { id, brandId } = useLocalSearchParams<{ id: string; brandId?: string }>();
  const router = useRouter();

  const state = useAsync(async () => {
    const cards = await getCards();
    // The list passes the brand through; without it, look across every card.
    const candidates = brandId ? cards.filter((c) => c.brandId === brandId) : cards;
    for (const card of candidates) {
      const found = (await getChallenges(card.brandId)).find((c) => c.id === id);
      if (found) return { challenge: found, card };
    }
    return null;
  }, [id, brandId]);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  if (state.loading) {
    return (
      <Screen scroll={false} bottomGap={34}>
        <BackBar fallback="/challenges" />
        <Loading />
      </Screen>
    );
  }

  if (state.error || !state.data) {
    return (
      <Screen scroll={false} bottomGap={34}>
        <BackBar fallback="/challenges" />
        <ErrorState
          message={state.error ?? 'This challenge is no longer running.'}
          onRetry={state.error ? state.refresh : undefined}
        />
      </Screen>
    );
  }

  const { challenge: c, card } = state.data;
  const done = Number(c.progress);
  const total = Math.max(Number(c.target), 1);
  const full = c.rewardReady || done >= total;
  const color = brandColor(card.brandId, card.branding);
  const reward = c.rewardName ?? (Number(c.rewardPoints) > 0 ? `${c.rewardPoints} points` : 'A reward');

  const blurb = c.isStampCard
    ? `Collect ${total} stamps at ${card.brandName} and the next one is on them.`
    : `Reach ${total} at ${card.brandName} to unlock this.`;

  return (
    <Screen scroll={false} bottomGap={34}>
      {/* Only for a card that is actually finished — confetti on every visit
          is confetti nobody sees. */}
      <Confetti active={full} />

      <BackBar fallback="/challenges" />

      <View style={{ flex: 1 }}>
        <H1 style={{ marginTop: 20 }}>{full ? `${reward} is yours` : c.name}</H1>
        <Lede style={{ marginTop: 12 }}>
          {full
            ? `You filled your ${c.name.toLowerCase()} at ${card.brandName}. Show the code below at the till.`
            : blurb}
        </Lede>

        <View style={{ marginTop: 30 }}>
          <Segments done={done} total={total} color={color} />
        </View>
        {full && c.rewardVoucherCode ? (
          <View
            style={{
              marginTop: 22,
              alignItems: 'center',
              backgroundColor: C.lime,
              borderRadius: R.card,
              paddingVertical: 22,
              paddingHorizontal: 18,
            }}
          >
            <Text
              style={{
                fontFamily: font(600),
                fontSize: 11,
                lineHeight: 16,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: C.ink,
              }}
            >
              Show this at the till
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontFamily: font(700),
                fontSize: 30,
                lineHeight: 36,
                letterSpacing: 3,
                color: C.ink,
              }}
            >
              {c.rewardVoucherCode}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Small style={{ fontSize: 12.5, lineHeight: 18 }}>
            {full ? 'Ready to claim' : `${done} of ${total}`}
          </Small>
          <Small style={{ fontSize: 12.5, lineHeight: 18 }}>
            {full ? 'Yours to use on your next visit' : `${total - done} to go`}
          </Small>
        </View>

        <View style={{ marginTop: 32 }}>
          <Label>Reward</Label>
          <View style={{ marginTop: 8 }}>
            <ListRow
              divider={false}
              lead={
                <Tile size={44} radius={R.control} background="rgba(255,74,28,.12)">
                  <Icon name="trophy" size={20} />
                </Tile>
              }
              title={reward}
              sub={card.brandName}
              trailing={<View />}
            />
          </View>
        </View>

        {c.completions > 0 ? (
          <Small style={{ marginTop: 20, color: C.soft }}>
            {c.completions === 1
              ? 'You have completed this once before.'
              : `You have completed this ${c.completions} times before.`}
          </Small>
        ) : null}
      </View>

      {/* Either way the next step is the same: be recognised at the till. */}
      <Button
        label={full ? 'Show my code to claim' : 'Show my code'}
        onPress={() => router.push('/scan')}
        style={{ borderRadius: R.card, height: 58 }}
      />
    </Screen>
  );
}
