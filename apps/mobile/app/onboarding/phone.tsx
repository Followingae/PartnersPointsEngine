import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Button, Screen, Small } from '@/components/UI';
import { C, font } from '@/lib/tokens';
import { BackButton, Caret, Footer, Sub, Title } from './_components';

/** 03 · Phone entry. */
export default function Phone() {
  const router = useRouter();

  function onContinue() {
    // TODO(api): requestOtp(msisdn) — send the code before advancing.
    router.push('/onboarding/otp');
  }

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <View style={{ marginTop: 20 }}>
        <Title>What’s your number?</Title>
        <Sub style={{ marginTop: 10 }}>We’ll text a 6-digit code.</Sub>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, height: 58,
            paddingHorizontal: 16, borderRadius: 16, backgroundColor: C.canvas,
          }}
        >
          <Text style={{ fontFamily: font(600), fontSize: 16, lineHeight: 22, color: C.ink }}>+971</Text>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 9l6 6 6-6" />
          </Svg>
        </View>

        <View
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', height: 58,
            paddingHorizontal: 18, borderRadius: 16, backgroundColor: C.canvas,
          }}
        >
          <Text style={{ fontFamily: font(600), fontSize: 17, lineHeight: 24, color: C.ink }}>50 123 4567</Text>
          <Caret />
        </View>
      </View>

      <Footer>
        <Button label="Continue" onPress={onContinue} />
        <Small style={{ marginTop: 16, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
          By continuing you agree to our Terms and Privacy Policy.
        </Small>
      </Footer>
    </Screen>
  );
}
