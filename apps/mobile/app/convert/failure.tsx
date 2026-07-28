import { useRouter } from 'expo-router';
import { Body, Button, H1, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';
import { CenterState, Disc, Footer, Ic, NotePill, TextAction } from '@/components/RewardKit';

/** Screen 41 — the transfer did not land. Say plainly that nothing was taken. */
export default function TransferFailed() {
  const router = useRouter();

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <Disc>
          <Ic name="alert" size={40} sw={1.7} />
        </Disc>
        <H1 style={{ marginTop: 32, textAlign: 'center' }}>Transfer failed</H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22.5, textAlign: 'center' }}>
          Lulu did not confirm. Your 2,000 points were not deducted.
        </Body>
        <NotePill label="Nothing was deducted" />
      </CenterState>

      <Footer>
        <Button label="Try again" onPress={() => router.replace('/convert')} />
        <TextAction label="Back to cards" onPress={() => router.replace('/(tabs)/home')} />
      </Footer>
    </Screen>
  );
}
