import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { Button, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';
import { Footer, Sub, TextLink, Title } from './_components';

/** 06 · Face ID. */
export default function Biometric() {
  const router = useRouter();
  const next = () => router.push('/onboarding/profiling');

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
        <View
          style={{
            width: 92, height: 92, borderRadius: 28, backgroundColor: C.canvas,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Rect x={5} y={10} width={14} height={10} rx={2} />
            <Path d="M8 10V8a4 4 0 0 1 8 0v2" />
          </Svg>
        </View>

        <Title style={{ marginTop: 32, textAlign: 'center' }}>Open with Face ID</Title>
        <Sub style={{ marginTop: 12, textAlign: 'center', lineHeight: 23 }}>A PIN works too.</Sub>
      </View>

      <Footer>
        {/* TODO(api): enrol the device key / prompt LocalAuthentication before advancing. */}
        <Button label="Enable Face ID" onPress={next} />
        <TextLink label="Use a PIN" onPress={next} />
      </Footer>
    </Screen>
  );
}
