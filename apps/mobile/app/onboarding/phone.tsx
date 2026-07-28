import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Button, Screen, Small } from '@/components/UI';
import { ApiError, requestOtp } from '@/lib/api';
import { C, font } from '@/lib/tokens';
import { BackButton, Footer, Sub, Title } from './_components';

/** Local digits → E.164, the only form the API accepts. */
export function toE164(local: string): string {
  const digits = local.replace(/\D/g, '').replace(/^0+/, '');
  return `+971${digits}`;
}

/** 50 123 4567 as you type, without fighting the cursor. */
function formatLocal(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean).join(' ');
}

/** 03 · Phone entry. */
export default function Phone() {
  const router = useRouter();
  const [local, setLocal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = local.replace(/\D/g, '');
  // A UAE mobile number is 9 digits once the leading zero is dropped.
  const valid = digits.length === 9;

  async function onContinue() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const phone = toE164(local);
    try {
      await requestOtp(phone);
      router.push({ pathname: '/onboarding/otp', params: { phone } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

          <TextInput
            value={local}
            onChangeText={(t) => {
              setLocal(formatLocal(t));
              setError(null);
            }}
            placeholder="50 123 4567"
            placeholderTextColor={C.soft}
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onContinue}
            style={{
              flex: 1, height: 58, paddingHorizontal: 18, borderRadius: 16,
              backgroundColor: C.canvas, fontFamily: font(600), fontSize: 17, color: C.ink,
            }}
          />
        </View>

        {error ? <Small style={{ marginTop: 14, color: C.crimson }}>{error}</Small> : null}

        <Footer>
          <Button label="Continue" onPress={onContinue} loading={busy} disabled={!valid} />
          <Small style={{ marginTop: 16, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
            By continuing you agree to our Terms and Privacy Policy.
          </Small>
        </Footer>
      </KeyboardAvoidingView>
    </Screen>
  );
}
