import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { BackBar, Icon } from '@/components/Bits';
import { H1, Screen, Small } from '@/components/UI';
import { C, SP, font } from '@/lib/tokens';
import { BADGES, EARNED_SUMMARY, type Badge } from '@/app/badges/_data';

const COLUMNS = 3;

function BadgeTile({ b, onPress }: { b: Badge; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.8 } : null]}>
      <View
        style={{
          aspectRatio: 1,
          borderRadius: 22,
          backgroundColor: b.color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={b.unlocked ? 'trophy' : 'lock'} size={32} color={b.glyph} weight={1.6} />
      </View>
      <Text
        style={{
          marginTop: 10,
          textAlign: 'center',
          fontFamily: font(b.unlocked ? 600 : 500),
          fontSize: 12, lineHeight: 17,
          color: b.unlocked ? C.ink : C.soft,
        }}
      >
        {b.name}
      </Text>
    </Pressable>
  );
}

export default function Badges() {
  const router = useRouter();

  // TODO(api): GET /customer/badges
  const rows: Badge[][] = [];
  for (let i = 0; i < BADGES.length; i += COLUMNS) rows.push(BADGES.slice(i, i + COLUMNS));

  return (
    <Screen>
      <BackBar fallback="/home" />
      <View style={{ marginTop: 20 }}>
        <H1>Badges</H1>
        <Small style={{ marginTop: 8, fontSize: 14, lineHeight: 20 }}>{EARNED_SUMMARY}</Small>
      </View>

      <View style={{ marginTop: SP.gutter, gap: SP.gap }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: SP.gap }}>
            {row.map((b) => (
              <BadgeTile key={b.id} b={b} onPress={() => router.push(`/badges/${b.id}`)} />
            ))}
            {/* keep a short last row on the same 3-column rhythm */}
            {Array.from({ length: COLUMNS - row.length }, (_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
          </View>
        ))}
      </View>
    </Screen>
  );
}
