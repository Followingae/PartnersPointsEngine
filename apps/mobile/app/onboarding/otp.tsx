import { ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Screen, Small } from '@/components/UI';
import { ApiError, getCards, getProfile, requestOtp } from '@/lib/api';
import { useSession } from '@/lib/session';
import { C, font } from '@/lib/tokens';
import { BackButton, Caret, Footer, Sub, Title } from './_components';

const LENGTH = 6;
const RESEND_SECONDS = 30;

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
  return <Text style={{ fontFamily: font(600), fontSize: 24, lineHeight: 29, color: C.ink }}>{value}</Text>;
}

/** +971501234567 → +971 50 123 4567, for the "sent to" line. */
function prettyPhone(e164: string): string {
  const m = /^\+971(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+971 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/**
 * Where a freshly signed-in person lands.
 *
 * The number is the account, so signing in can mean three quite different
 * things: a till has been earning them points for months (05 shows them what
 * they already have), they've been here before (straight to the wallet), or
 * this is genuinely the first time (06 → 07 → 08 sets them up). Guessing wrong
 * either hides someone's balance or re-asks a returning customer for their
 * birthday, so both facts are read before deciding.
 *
 * A failure here is not worth blocking a successful sign-in over — the wallet
 * is the safe landing.
 */
async function landing(): Promise<'/onboarding/account-found' | '/onboarding/biometric' | '/home'> {
  try {
    const [cards, profile] = await Promise.all([getCards(), getProfile()]);
    if (cards.length > 0) return '/onboarding/account-found';
    // Nothing to celebrate and nothing to ask — don't make them sit through setup again.
    return profile.birthdate ? '/home' : '/onboarding/biometric';
  } catch {
    return '/home';
  }
}

/**
 * 04 · OTP.
 *
 * The six boxes display one hidden input rather than being six inputs — that
 * keeps paste, SMS autofill and backspace behaving the way people expect.
 */
export default function Otp() {
  const router = useRouter();
  const session = useSession();
  const { phone } = useLocalSearchParams<{ phone?: string }>();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const input = useRef<TextInput>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  async function verify(value: string) {
    if (busy || !phone) return;
    submitted.current = true;
    setBusy(true);
    setError(null);
    try {
      await session.signIn(phone, value);
      router.replace(await landing());
    } catch (e) {
      // Let them correct it here rather than bouncing them back a screen.
      setError(e instanceof ApiError ? e.message : 'That code didn’t work. Try again.');
      setCode('');
      submitted.current = false;
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onChange(raw: string) {
    const next = raw.replace(/\D/g, '').slice(0, LENGTH);
    setCode(next);
    setError(null);
    // Submit as soon as it's complete — nobody wants to reach for a button here.
    if (next.length === LENGTH && !submitted.current) void verify(next);
  }

  async function resend() {
    if (!phone || seconds > 0) return;
    setSeconds(RESEND_SECONDS);
    setError(null);
    try {
      await requestOtp(phone);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not resend the code.');
    }
  }

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <BackButton onPress={() => router.back()} />
        </View>

        <View style={{ marginTop: 20 }}>
          <Title>Enter the code</Title>
          <Sub style={{ marginTop: 10 }}>
            {phone ? `Sent to ${prettyPhone(phone)}` : 'Sent to your phone'}
          </Sub>
        </View>

        <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: 10, marginTop: 32 }}>
          {Array.from({ length: LENGTH }).map((_, i) => {
            const char = code[i];
            const isCursor = i === code.length && !busy;
            return (
              <Cell key={i} filled={Boolean(char)}>
                {char ? <Digit value={char} /> : isCursor ? <Caret height={24} offset={0} /> : null}
              </Cell>
            );
          })}
        </Pressable>

        {/* The real field: invisible, but focused and holding the value. */}
        <TextInput
          ref={input}
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={LENGTH}
          autoFocus
          caretHidden
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
        />

        {error ? (
          <Small style={{ marginTop: 20, textAlign: 'center', color: C.crimson }}>{error}</Small>
        ) : (
          <Pressable onPress={resend} disabled={seconds > 0}>
            <Small style={{ marginTop: 26, fontSize: 13.5, lineHeight: 19, textAlign: 'center' }}>
              {seconds > 0 ? `Resend in 0:${String(seconds).padStart(2, '0')}` : 'Resend code'}
            </Small>
          </Pressable>
        )}

        <Footer>
          <Button
            label="Verify"
            onPress={() => verify(code)}
            loading={busy}
            disabled={code.length !== LENGTH}
          />
        </Footer>
      </View>
    </Screen>
  );
}
