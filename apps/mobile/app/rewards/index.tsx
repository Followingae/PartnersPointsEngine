import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Chip, H1, Label, Screen, Small } from '@/components/UI';
import { C, R, T, font } from '@/lib/tokens';
import { Ic, TopBar } from '@/components/RewardKit';

/** One of the two tiles under "Everything else". */
function RewardTile({ id, name, note, cost }: { id: string; name: string; note: string; cost: string }) {
  const router = useRouter();
  return (
    <Card
      onPress={() => router.push(`/rewards/${id}`)}
      style={{ flex: 1, padding: 0, borderRadius: 22, overflow: 'hidden' }}
    >
      <View style={{ height: 76, backgroundColor: 'rgba(255,74,28,.1)', alignItems: 'center', justifyContent: 'center' }}>
        <Ic name="cup" size={34} color={C.orange} sw={1.5} />
      </View>
      <View style={{ paddingHorizontal: 15, paddingTop: 14, paddingBottom: 16 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }}>{name}</Text>
        <Small style={{ marginTop: 4, fontSize: 12, lineHeight: 17 }}>{note}</Small>
        <Text style={{ marginTop: 12, fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>{cost}</Text>
      </View>
    </Card>
  );
}

export default function Rewards() {
  const router = useRouter();
  return (
    <Screen background={C.surface} bottomGap={30}>
      <TopBar />

      <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <H1>Rewards</H1>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: font(600), fontSize: 22, lineHeight: 27, letterSpacing: -0.66, color: C.ink }}>2,480</Text>
          <Small style={{ fontSize: 12, lineHeight: 17 }}>pts at Camel Bean</Small>
        </View>
      </View>

      {/* Hero — the one reward the balance already covers. */}
      <Pressable
        onPress={() => router.push('/rewards/flat-white')}
        style={({ pressed }) => [
          { marginTop: 22, borderRadius: R.sheet, backgroundColor: C.orange, paddingVertical: 22, paddingHorizontal: 24 },
          pressed ? { opacity: 0.94 } : null,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label style={{ color: C.ink, letterSpacing: 1.3 }}>Ready now</Label>
          <Ic name="cup" size={26} sw={1.5} />
        </View>
        <Text style={{
          marginTop: 18, fontFamily: font(600), fontSize: 25, lineHeight: 28.5,
          letterSpacing: -0.75, color: C.ink, maxWidth: 220,
        }}>
          Free flat white
        </Text>
        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...T.body, fontSize: 13.5, lineHeight: 19, color: C.ink }}>450 pts · balance after 2,030</Text>
          <Chip label="Redeem" tone="ink" style={{ paddingHorizontal: 16, paddingVertical: 10 }} />
        </View>
      </Pressable>

      <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Label style={{ letterSpacing: 1.3 }}>Everything else</Label>
        <Small style={{ fontSize: 12.5, lineHeight: 18 }}>See all 6</Small>
      </View>

      <View style={{ marginTop: 16, flexDirection: 'row', gap: 12 }}>
        <RewardTile id="pastry" name="Pastry of the day" note="Any branch" cost="800 pts" />
        <RewardTile id="beans" name="Bag of beans, 250g" note="Roasted weekly" cost="2,400 pts" />
      </View>

      {/* Next thing worth saving for. */}
      <View style={{
        marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingVertical: 16, paddingHorizontal: 18, borderRadius: 20, backgroundColor: C.canvas,
      }}>
        <Ic name="gift" size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }}>1,520 pts to the brew class</Text>
          <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>About 12 more visits</Small>
        </View>
        <Ic name="right" size={17} color={C.soft} sw={2} />
      </View>
    </Screen>
  );
}
