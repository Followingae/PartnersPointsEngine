import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { Button, Screen, Small } from '@/components/UI';
import { lockSupport, setLockEnabled, unlock, type LockSupport } from '@/lib/lock';
import { C } from '@/lib/tokens';
import { Footer, Sub, TextLink, Title } from './_components';

/** Where setup carries on for someone who has no cards yet. */
const SETUP = '/onboarding/profiling';

/**
 * 06 · Face ID.
 *
 * Enabling it proves it works before storing the preference: the enrolment is
 * the same prompt the lock will use, so a device that refuses here would have
 * refused later, at the point where someone is locked out of their own wallet.
 *
 * The screen names what the device actually has rather than saying "Face ID" at
 * an Android fingerprint reader, and a device with no biometrics at all skips
 * itself — there is nothing here to offer.
 */
export default function Biometric() {
  const router = useRouter();
  // A returning customer passes ?next=/home: they have cards, so there is
  // nothing left to set up and walking them through the new-user chain ends on
  // "No brands to join yet", which is the opposite of a welcome.
  const { next: nextParam } = useLocalSearchParams<{ next?: string }>();
  const NEXT = (Array.isArray(nextParam) ? nextParam[0] : nextParam) ?? SETUP;
  const [support, setSupport] = useState<LockSupport | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const next = () => router.replace(NEXT);

  useEffect(() => {
    let alive = true;
    void lockSupport().then((s) => {
      if (!alive) return;
      setSupport(s);
      if (!s.usable) router.replace(NEXT);
    });
    return () => {
      alive = false;
    };
  }, [router]);

  async function enable() {
    setBusy(true);
    setFailed(false);
    const ok = await unlock('Turn on unlock for your wallet');
    if (ok) {
      await setLockEnabled(true);
      next();
      return;
    }
    setFailed(true);
    setBusy(false);
  }

  async function skip() {
    await setLockEnabled(false);
    next();
  }

  // Held until support is known, so the copy never names the wrong sensor.
  if (!support?.usable) {
    return (
      <Screen scroll={false} background={C.surface}>
        <View style={{ flex: 1 }} />
      </Screen>
    );
  }

  const name = support.label;

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

        <Title style={{ marginTop: 32, textAlign: 'center' }}>{`Open with ${name}`}</Title>
        <Sub style={{ marginTop: 12, textAlign: 'center', lineHeight: 23 }}>
          Your device passcode works too.
        </Sub>

        {failed ? (
          <Small style={{ marginTop: 18, textAlign: 'center', color: C.crimson }}>
            {`That didn’t go through. You can turn ${name} on later in Security.`}
          </Small>
        ) : null}
      </View>

      <Footer>
        <Button label={failed ? 'Try again' : `Enable ${name}`} onPress={enable} loading={busy} disabled={busy} />
        <TextLink label="Not now" onPress={() => void skip()} />
      </Footer>
    </Screen>
  );
}
