import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Small } from '@/components/UI';
import { C } from '@/lib/tokens';
import { ListRow, SheetScreen, TextAction } from '@/components/RewardKit';

const RATE = 5;

/** Screen 40 — last stop before the points leave. */
export default function ConvertReview() {
  const router = useRouter();
  const { amount } = useLocalSearchParams<{ amount?: string }>();

  const points = Number(amount ?? 2000) || 2000;
  const luluOut = Math.floor(points / RATE);
  const fmt = (v: number) => v.toLocaleString('en-US');

  return (
    <SheetScreen backdrop={C.electric} title="Confirm transfer">
      <View style={{ marginTop: 22 }}>
        {/* TODO(api): the source split comes from the server's allocation plan. */}
        <ListRow title="From" sub="Camel Bean 1,200 · Núr 800" value={`${fmt(points)} pts`} />
        <ListRow title="Rate" sub="Fixed today" value={`${RATE} : 1`} divider />
        <ListRow title="To Lulu" sub="•••• 4821" value={fmt(luluOut)} divider />
      </View>

      <Small tone="faint" style={{ marginTop: 18, fontSize: 12.5, lineHeight: 19 }}>
        Transfers are final. Lulu points cannot be converted back.
      </Small>

      <View style={{ marginTop: 22 }}>
        {/* TODO(api): convert — POST the transfer, then follow the job to success or failure. */}
        <Button label="Confirm" onPress={() => router.replace('/convert/processing')} />
        <TextAction label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/convert'))} />
      </View>
    </SheetScreen>
  );
}
