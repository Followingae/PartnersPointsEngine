import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { BackBar, Stamps } from '@/components/Bits';
import { brandColor } from '@/components/BrandCard';
import { Card, Chip, EmptyState, ErrorState, H1, Loading, Progress, Screen, Small } from '@/components/UI';
import { getCards, getChallenges, type Card as WalletCard, type Challenge } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, SP, font } from '@/lib/tokens';

/** A challenge with the card it belongs to, since the list spans brands. */
interface Row {
  challenge: Challenge;
  card: WalletCard;
}

/** "3 of 8" while filling, "Ready" once it's full. */
function statusOf(c: Challenge): { label: string; ready: boolean } {
  const done = Number(c.progress);
  const total = Number(c.target);
  if (done >= total) return { label: 'Ready', ready: true };
  if (c.isStampCard) return { label: `${done} of ${total}`, ready: false };
  return { label: `${c.progressPct}%`, ready: false };
}

function ChallengeCard({ row, onPress }: { row: Row; onPress: () => void }) {
  const { challenge: c, card } = row;
  const { label, ready } = statusOf(c);
  const color = brandColor(card.brandId, card.branding);
  const done = Number(c.progress);
  const total = Math.max(Number(c.target), 1);

  // What they get and where — the two things that make a challenge worth doing.
  const reward = c.rewardName ?? (Number(c.rewardPoints) > 0 ? `+${c.rewardPoints} pts` : null);
  const meta = [card.brandName, reward].filter(Boolean).join(' · ');

  return (
    <Card onPress={onPress} style={{ paddingVertical: 20, paddingHorizontal: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: font(600), fontSize: 15.5, lineHeight: 22, color: C.ink }}>{c.name}</Text>
          <Small style={{ marginTop: 4, fontSize: 12.5, lineHeight: 18 }}>{meta}</Small>
        </View>
        <Chip label={label} tone={ready ? 'lime' : 'neutral'} />
      </View>
      <View style={{ marginTop: 14 }}>
        {c.isStampCard ? (
          <Stamps done={done} total={total} color={color} />
        ) : (
          <Progress value={done} total={total} color={color} height={3} />
        )}
      </View>
      {c.completions > 0 ? (
        <Small style={{ marginTop: 10, fontSize: 12 }}>
          {c.completions === 1 ? 'Completed once already' : `Completed ${c.completions} times already`}
        </Small>
      ) : null}
    </Card>
  );
}

/**
 * 43 · Challenges — goals and stamp cards across every card in the wallet.
 *
 * Challenges are defined per brand, so this fans out over the cards and
 * flattens the result: a customer thinks in terms of "my challenges", not
 * "Camel Bean's challenges".
 */
export default function Challenges() {
  const router = useRouter();

  const state = useAsync<Row[]>(async () => {
    const cards = await getCards();
    const perCard = await Promise.all(
      cards.map(async (card) => {
        try {
          return (await getChallenges(card.brandId)).map((challenge) => ({ challenge, card }));
        } catch {
          // One brand failing shouldn't blank the whole list.
          return [] as Row[];
        }
      }),
    );
    // Closest to finishing first — that's the one worth acting on.
    return perCard.flat().sort((a, b) => b.challenge.progressPct - a.challenge.progressPct);
  }, []);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <BackBar fallback="/home" />
      <H1 style={{ marginTop: 20 }}>Challenges</H1>

      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={state.refresh} />
      ) : !state.data?.length ? (
        <EmptyState
          title="No challenges yet"
          body="When a brand runs a stamp card or a goal, it shows up here."
          actionLabel="Find brands"
          onAction={() => router.push('/discover')}
        />
      ) : (
        <View style={{ marginTop: SP.gutter, gap: SP.gap }}>
          {state.data.map((row) => (
            <ChallengeCard
              key={`${row.card.brandId}:${row.challenge.id}`}
              row={row}
              onPress={() => router.push(`/challenges/${row.challenge.id}?brandId=${row.card.brandId}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
