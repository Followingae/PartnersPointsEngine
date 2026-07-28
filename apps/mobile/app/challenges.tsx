import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { BackBar, Stamps } from '@/components/Bits';
import { Card, Chip, H1, Progress, Screen, Small } from '@/components/UI';
import { C, SP, font } from '@/lib/tokens';
import { CHALLENGES, type Challenge } from '@/app/challenges/_data';

function ChallengeCard({ c, onPress }: { c: Challenge; onPress: () => void }) {
  const ready = c.done >= c.total;
  return (
    <Card onPress={onPress} style={{ paddingVertical: 20, paddingHorizontal: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: font(600), fontSize: 15.5, color: C.ink }}>{c.title}</Text>
          <Small style={{ marginTop: 4, fontSize: 12.5 }}>{c.meta}</Small>
        </View>
        <Chip label={c.status} tone={ready ? 'lime' : 'neutral'} />
      </View>
      <View style={{ marginTop: 14 }}>
        {c.kind === 'stamp'
          ? <Stamps done={c.done} total={c.total} color={c.color} />
          : <Progress value={c.done} total={c.total} color={c.color} height={3} />}
      </View>
    </Card>
  );
}

export default function Challenges() {
  const router = useRouter();

  // TODO(api): GET /customer/challenges — goals and stamp cards with live counts.
  return (
    <Screen>
      <BackBar fallback="/home" />
      <H1 style={{ marginTop: 20 }}>Challenges</H1>
      <View style={{ marginTop: SP.gutter, gap: SP.gap }}>
        {CHALLENGES.map((c) => (
          <ChallengeCard key={c.id} c={c} onPress={() => router.push(`/challenges/${c.id}`)} />
        ))}
      </View>
    </Screen>
  );
}
