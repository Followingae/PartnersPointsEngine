import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import { Caret, PrimaryButton } from './_components';

function Cell({ children, active, filled }: { children?: React.ReactNode; active?: boolean; filled?: boolean }) {
  const t = useTokens();
  return (
    <View
      style={{
        flex: 1,
        aspectRatio: 1 / 1.15,
        borderRadius: 16,
        backgroundColor: t.card,
        borderWidth: active || filled ? 2 : 1,
        borderColor: active || filled ? BRAND.blue : t.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

export default function Otp() {
  const t = useTokens();
  const router = useRouter();

  function onVerify() {
    // TODO(api): verifyOtp(phone, code, brandId) then store token
    router.push('/onboarding/biometric');
  }

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
          <BackButton fallback="/onboarding/phone" />
        </View>

        <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 24 }}>
          <Text style={{ fontFamily: font.display(700), fontSize: 30, lineHeight: 31, letterSpacing: -0.6, color: t.ink }}>Enter the code</Text>
          <Text style={{ marginTop: 12, fontFamily: font.sans(400), fontSize: 15, color: t.soft }}>
            Sent to +971 50 123 4567 · <Text onPress={() => router.push('/onboarding/phone')} style={{ fontFamily: font.sans(700), color: BRAND.blue }}>Edit</Text>
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 32 }}>
            <Cell filled><Text style={{ fontFamily: font.display(700), fontSize: 26, color: t.ink }}>4</Text></Cell>
            <Cell filled><Text style={{ fontFamily: font.display(700), fontSize: 26, color: t.ink }}>8</Text></Cell>
            <Cell filled><Text style={{ fontFamily: font.display(700), fontSize: 26, color: t.ink }}>2</Text></Cell>
            <Cell active><Caret height={26} /></Cell>
            <Cell />
            <Cell />
          </View>

          <Text style={{ marginTop: 26, fontFamily: font.sans(400), fontSize: 14, color: t.faint, textAlign: 'center' }}>Resend code in 0:24</Text>
        </View>

        <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
          <PrimaryButton label="Verify" onPress={onVerify} />
        </View>
      </View>
    </Screen>
  );
}
