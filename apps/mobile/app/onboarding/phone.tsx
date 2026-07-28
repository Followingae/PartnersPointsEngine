import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { font } from '@/lib/tokens';
import { Caret, PrimaryButton } from './_components';

export default function Phone() {
  const t = useTokens();
  const router = useRouter();

  function onContinue() {
    // TODO(api): requestOtp(phone) then navigate
    router.push('/onboarding/otp');
  }

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
          <BackButton fallback="/onboarding/carousel" />
        </View>

        <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 24 }}>
          <Text style={{ fontFamily: font.display(700), fontSize: 30, lineHeight: 31, letterSpacing: -0.6, color: t.ink }}>What&apos;s your number?</Text>
          <Text style={{ marginTop: 12, fontFamily: font.sans(400), fontSize: 15, lineHeight: 21, color: t.soft }}>
            We&apos;ll text you a 6-digit code to sign in or create your account.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, paddingHorizontal: 14, height: 58 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: t.ink }}>🇦🇪 +971</Text>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2.4} strokeLinecap="round">
                <Path d="M6 9l6 6 6-6" />
              </Svg>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, height: 58, paddingHorizontal: 16 }}>
              <Text style={{ fontFamily: font.sans(600), fontSize: 17, color: t.ink }}>50 123 4567</Text>
              <Caret />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
          <PrimaryButton label="Continue" onPress={onContinue} />
          <Text style={{ marginTop: 16, fontFamily: font.sans(400), fontSize: 11.5, color: t.faint, textAlign: 'center' }}>
            By continuing you agree to our Terms &amp; Privacy Policy.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
