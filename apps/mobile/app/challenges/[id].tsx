import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { BackBar, Icon, Lede, ListRow, Segments, Tile } from '@/components/Bits';
import { Button, H1, Label, Screen, Small } from '@/components/UI';
import { R } from '@/lib/tokens';
import { findChallenge } from '@/app/challenges/_data';

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // TODO(api): GET /customer/challenges/:id — progress refreshes after each visit.
  const c = findChallenge(id);
  const stamp = c.kind === 'stamp';

  return (
    <Screen scroll={false} bottomGap={34}>
      <BackBar fallback="/challenges" />

      <View style={{ flex: 1 }}>
        <H1 style={{ marginTop: 20 }}>{c.title}</H1>
        <Lede style={{ marginTop: 12 }}>{c.blurb}</Lede>

        <View style={{ marginTop: 30 }}>
          <Segments done={c.done} total={c.total} color={c.color} />
        </View>
        <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Small style={{ fontSize: 12.5, lineHeight: 18 }}>{c.footLeft}</Small>
          <Small style={{ fontSize: 12.5, lineHeight: 18 }}>{c.footRight}</Small>
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
              title={c.reward}
              sub={c.rewardSub}
              trailing={<View />}
            />
          </View>
        </View>
      </View>

      <Button
        label={stamp && c.done >= c.total ? 'Claim reward' : 'Show my QR'}
        onPress={() => router.push('/scan')}
        style={{ borderRadius: R.card, height: 58 }}
      />
    </Screen>
  );
}
