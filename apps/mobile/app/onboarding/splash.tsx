import { useEffect } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Small } from '@/components/UI';
import { C } from '@/lib/tokens';
import { PulseDot } from './_components';

/** How long the wordmark holds before the flow moves on. */
const HOLD_MS = 1800;

/** 01 · Splash — wordmark, tagline, pulsing loader. */
export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    const id = setTimeout(() => router.replace('/onboarding/carousel'), HOLD_MS);
    return () => clearTimeout(id);
  }, [router]);

  return (
    <Screen scroll={false} background={C.surface} bottomGap={40}>
      <Pressable style={{ flex: 1 }} onPress={() => router.replace('/onboarding/carousel')}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={require('../../assets/pp-wordmark-dark.png')}
            resizeMode="contain"
            style={{ width: 232, height: 33 }}
          />
          <Small style={{ marginTop: 20, fontSize: 14.5 }}>Your points, in one place.</Small>
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
