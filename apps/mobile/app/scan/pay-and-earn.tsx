import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Row, money, pts } from '@/components/UI';
import { C, S, SP, font } from '@/lib/tokens';

/** 29 · Pay and earn — the receipt mirror after paying partly with points. */

// TODO(api): the settled transaction from POST /customer/scan (pay-and-earn kind)
const TXN = {
  where: 'Camel Bean · Al Quoz',
  when: 'Today · 2:41 PM · #40912',
  billMinor: 6800,
  pointsSpent: 500,
  pointsValueMinor: 500,
  cardMinor: 6300,
  earned: 63,
  balance: 2043,
};

/** A dashed rule — RN's dashed borders are unreliable, so draw the dashes. */
function DashedRule() {
  return (
    <View style={{ flexDirection: 'row', overflow: 'hidden', height: 1 }}>
      {Array.from({ length: 60 }, (_, i) => (
        <View key={i} style={{ width: 4, height: 1, marginRight: 3, backgroundColor: C.hairline }} />
      ))}
    </View>
  );
}

export default function PayAndEarn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: SP.gutter }}>
        <Card style={{ borderRadius: 22, paddingHorizontal: 24, paddingVertical: 26 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }}>{TXN.where}</Text>
            <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.soft, marginTop: 5 }}>{TXN.when}</Text>
          </View>

          <View style={{ marginTop: 24, paddingTop: 22 }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}><DashedRule /></View>
            <View style={{ gap: 15 }}>
              <Row label="Bill" value={money(TXN.billMinor)} />
              <Row
                label="Paid with points"
                value={`−${pts(TXN.pointsSpent)} pts · ${money(TXN.pointsValueMinor)}`}
                valueColor={S.spend}
              />
              <Row label="Paid by card" value={money(TXN.cardMinor)} />
              <Row label="Earned" value={`+${pts(TXN.earned)} pts`} valueColor={S.earnInk} />
            </View>
          </View>

          <View style={{ marginTop: 22, paddingTop: 22 }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}><DashedRule /></View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: font(500), fontSize: 14.5, lineHeight: 20, color: C.muted }}>Balance</Text>
              <Text style={{ fontFamily: font(600), fontSize: 30, lineHeight: 35, letterSpacing: -0.9, color: C.ink }}>{pts(TXN.balance)}</Text>
            </View>
          </View>
        </Card>

        <Text style={{ marginTop: 20, marginHorizontal: 2, textAlign: 'center', fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.soft }}>
          The same numbers as your printed receipt.
        </Text>
      </View>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button label="Done" onPress={() => router.replace('/home')} style={{ height: 58, borderRadius: 18 }} />
      </View>
    </View>
  );
}
