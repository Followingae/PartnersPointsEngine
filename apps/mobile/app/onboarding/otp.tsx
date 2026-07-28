import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, Small } from '@/components/UI';
import { C, font } from '@/lib/tokens';
import { BackButton, Caret, Footer, Sub, Title } from './_components';

/** One OTP box. Filled boxes are washed in; empty ones are outlined. */
function Cell({ children, filled }: { children?: ReactNode; filled?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        aspectRatio: 1 / 1.15,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? C.canvas : C.surface,
        borderWidth: filled ? 0 : 1.5,
        borderColor: C.hairline,
      }}
    >
      {children}
    </View>
  );
}

function Digit({ value }: { value: string }) {
  return <Text style={{ fontFamily: font(600), fontSize: 24, color: C.ink }}>{value}</Text>;
}

/** 04 · OTP. */
export default function Otp() {
  const router = useRouter();

  function onVerify() {
    // TODO(api): verifyOtp(msisdn, code) — persist the session token before advancing.
    router.push('/onboarding/account-found');
  }

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <View style={{ marginTop: 20 }}>
        <Title>Enter the code</Title>
        <Sub style={{ marginTop: 10 }}>Sent to +971 50 123 4567</Sub>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 32 }}>
        <Cell filled><Digit value="4" /></Cell>
        <Cell filled><Digit value="8" /></Cell>
        <Cell filled><Digit value="2" /></Cell>
        <Cell><Caret height={24} offset={0} /></Cell>
        <Cell />
        <Cell />
      </View>

      <Small style={{ marginTop: 26, fontSize: 13.5, textAlign: 'center' }}>Resend in 0:24</Small>

      <Footer>
        <Button label="Verify" onPress={onVerify} />
      </Footer>
    </Screen>
  );
}
