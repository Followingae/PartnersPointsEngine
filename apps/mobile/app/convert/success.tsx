import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, H1, Screen, Small, pts } from '@/components/UI';
import { getCards } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, font } from '@/lib/tokens';
import { CenterState, Footer, Ic } from '@/components/RewardKit';

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, padding: 18, borderRadius: 18, backgroundColor: C.canvas }}>
      <Text style={{ fontFamily: font(500), fontSize: 11.5, lineHeight: 16, color: C.muted }} numberOfLines={1}>{label}</Text>
      <Text style={{ marginTop: 8, fontFamily: font(600), fontSize: 24, lineHeight: 29, letterSpacing: -0.72, color: C.ink }}>
        {value}
      </Text>
    </View>
  );
}

/** The transfer settled. Both sides of it, side by side. */
export default function ConvertSuccess() {
  const router = useRouter();
  const { brandId, amount, partnerPoints } = useLocalSearchParams<{
    brandId?: string; amount?: string; partnerPoints?: string;
  }>();

  const points = Number(amount ?? 0) || 0;
  const received = partnerPoints ? Number(partnerPoints) : null;

  // The burn has posted, so the card is re-read rather than guessed at.
  const { data: cards } = useAsync(getCards, []);
  const card = cards?.find((c) => c.brandId === brandId);

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <View style={{
          width: 80, height: 80, borderRadius: 999, backgroundColor: C.green,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ic name="check" size={36} sw={2.4} />
        </View>

        <H1 style={{ marginTop: 28, fontSize: 28, lineHeight: 34, textAlign: 'center' }}>
          {pts(points)} pts converted
        </H1>
        {card ? (
          <Small style={{ marginTop: 10, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
            From {card.brandName}
          </Small>
        ) : null}

        <View style={{ marginTop: 30, alignSelf: 'stretch', flexDirection: 'row', gap: 12 }}>
          <StatTile label={card ? `${card.brandName} left` : 'Points left'} value={card ? pts(Number(card.available)) : '—'} />
          <StatTile label="Lulu" value={received !== null ? pts(received) : '—'} />
        </View>
      </CenterState>

      <Footer>
        <Button label="Done" onPress={() => router.replace('/(tabs)/home')} />
      </Footer>
    </Screen>
  );
}
