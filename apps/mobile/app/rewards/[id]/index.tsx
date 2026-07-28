import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, H1, Screen, Small } from '@/components/UI';
import { C, R, font } from '@/lib/tokens';
import { Footer, Ic, TopBar } from '@/components/RewardKit';

export default function RewardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // TODO(api): fetch the reward by id — copy below is the design's sample.
  const reward = {
    name: 'Free flat white',
    cost: '450 pts',
    balanceAfter: 'Balance after 2,030',
    blurb: 'Any size, any branch. The voucher lasts 14 days once you claim it, and the barcode is scanned at the till.',
  };

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar />

      <View style={{ paddingTop: 30, paddingBottom: 34, alignItems: 'center' }}>
        <Ic name="cup" size={64} sw={1.3} />
      </View>

      <H1 style={{ fontSize: 28, lineHeight: 34 }}>{reward.name}</H1>

      <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: R.chip, backgroundColor: C.canvas }}>
          <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>{reward.cost}</Text>
        </View>
        <Small style={{ fontSize: 13.5, lineHeight: 19 }}>{reward.balanceAfter}</Small>
      </View>

      <Body tone="muted" style={{ marginTop: 20, fontSize: 14.5, lineHeight: 23 }}>
        {reward.blurb}
      </Body>

      <Footer>
        <Button label={`Redeem ${reward.cost}`} onPress={() => router.push(`/rewards/${id}/redeem`)} />
      </Footer>
    </Screen>
  );
}
