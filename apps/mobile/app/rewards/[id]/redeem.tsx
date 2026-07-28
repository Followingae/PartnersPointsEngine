import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/UI';
import { C } from '@/lib/tokens';
import { ListRow, SheetScreen, TextAction } from '@/components/RewardKit';

export default function ConfirmRedemption() {
  const router = useRouter();

  return (
    <SheetScreen backdrop={C.orange} title="Redeem this?">
      <View style={{ marginTop: 22 }}>
        <ListRow
          icon="cup"
          iconBg="rgba(255,74,28,.12)"
          title="Free flat white"
          sub="Valid 14 days"
        />
        <ListRow title="Cost" value="450 pts" divider />
        <ListRow title="Balance after" value="2,030 pts" divider />
      </View>

      <View style={{ marginTop: 26 }}>
        {/* TODO(api): redeem — POST the redemption, then route to the issued voucher. */}
        <Button label="Redeem" onPress={() => router.replace('/rewards/redeemed')} />
        <TextAction
          label="Cancel"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/rewards'))}
        />
      </View>
    </SheetScreen>
  );
}
