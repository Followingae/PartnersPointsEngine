import { useRouter } from 'expo-router';
import { Body, Button, H1, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';
import { CenterState, Disc, Footer, Ic, TextAction } from '@/components/RewardKit';

export default function Redeemed() {
  const router = useRouter();

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <Disc background={C.green}>
          <Ic name="check" size={40} sw={2.4} />
        </Disc>
        <H1 style={{ marginTop: 32, textAlign: 'center' }}>Voucher ready</H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 20, textAlign: 'center' }}>
          Free flat white · 450 pts · balance 2,030
        </Body>
      </CenterState>

      <Footer>
        <Button label="Show at till" onPress={() => router.replace('/voucher/cb-9k2d-4417')} />
        <TextAction label="Later" onPress={() => router.replace('/rewards')} />
      </Footer>
    </Screen>
  );
}
