import { Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, H1, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';
import { CenterState, Disc, Footer, TextAction } from '@/components/RewardKit';

/** Screen 38 — link confirmed. */
export default function LuluLinked() {
  const router = useRouter();

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <Disc>
          <Image source={require('@/assets/lulu-icon.png')} style={{ width: 48, height: 48, resizeMode: 'contain' }} />
        </Disc>
        <H1 style={{ marginTop: 32, textAlign: 'center' }}>Lulu linked</H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 20, textAlign: 'center' }}>
          •••• 4821 · 1,240 Lulu points today
        </Body>
      </CenterState>

      <Footer>
        <Button label="Convert points now" onPress={() => router.replace('/convert')} />
        <TextAction label="Later" onPress={() => router.replace('/(tabs)/home')} />
      </Footer>
    </Screen>
  );
}
