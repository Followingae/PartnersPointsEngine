import { Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, H1, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';
import { CenterState, Disc, Footer, TextAction } from '@/components/RewardKit';

/** Only the last four digits are shown back — the app never needs the rest. */
const mask = (ref: string) => (ref.length > 4 ? `•••• ${ref.slice(-4)}` : ref);

export default function LuluLinked() {
  const router = useRouter();
  const { brandId, memberRef } = useLocalSearchParams<{ brandId?: string; memberRef?: string }>();

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <Disc>
          <Image source={require('@/assets/lulu-icon.png')} style={{ width: 48, height: 48, resizeMode: 'contain' }} />
        </Disc>
        <H1 style={{ marginTop: 32, textAlign: 'center' }}>Lulu linked</H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 20, textAlign: 'center' }}>
          {memberRef ? mask(memberRef) : 'Your account is connected.'}
        </Body>
      </CenterState>

      <Footer>
        <Button
          label="Convert points now"
          onPress={() => router.replace({ pathname: '/convert', params: brandId ? { brandId } : {} })}
        />
        <TextAction label="Later" onPress={() => router.replace('/(tabs)/home')} />
      </Footer>
    </Screen>
  );
}
