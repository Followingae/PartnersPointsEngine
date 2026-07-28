import { useEffect } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Small } from '@/components/UI';
import { useSession } from '@/lib/session';
import { C } from '@/lib/tokens';
import { PulseDot } from './_components';

/** How long the wordmark holds before the flow moves on. */
const HOLD_MS = 1800;

/**
 * 01 · Splash — wordmark, tagline, pulsing loader.
 *
 * Also the gate: a returning session goes straight to the cards. The hold is
 * what the session restore happens behind, so signing in once actually feels
 * like staying signed in.
 */
export default function Splash() {
  const router = useRouter();
  const { signedIn, restoring } = useSession();

  const next = () => router.replace(signedIn ? '/home' : '/onboarding/carousel');

  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(next, HOLD_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoring, signedIn]);

  return (
    <Screen scroll={false} background={C.surface} bottomGap={40}>
      <Pressable style={{ flex: 1 }} onPress={() => !restoring && next()}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={require('../../assets/pp-wordmark-dark.png')}
            resizeMode="contain"
            style={{ width: 232, height: 33 }}
          />
          <Small style={{ marginTop: 20, fontSize: 14.5, lineHeight: 20 }}>Your points, in one place.</Small>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <PulseDot />
          <PulseDot delay={200} />
          <PulseDot delay={400} />
        </View>
      </Pressable>
    </Screen>
  );
}
