import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Small } from '@/components/UI';
import { C, R, font } from '@/lib/tokens';

function PulseDot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, v]);

  return (
    <Animated.View
      style={{
        width: 10, height: 10, borderRadius: R.chip, backgroundColor: C.ink,
        opacity: v, transform: [{ scale: v }],
      }}
    />
  );
}

/** Screen 39, processing state — the transfer is in flight. */
export default function ConvertProcessing() {
  const router = useRouter();
  const { amount } = useLocalSearchParams<{ amount?: string }>();

  useEffect(() => {
    // TODO(api): convert — poll the transfer job instead of this timer.
    const t = setTimeout(
      () => router.replace({ pathname: '/convert/success', params: { amount: amount ?? '2000' } }),
      1800,
    );
    return () => clearTimeout(t);
  }, [router, amount]);

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PulseDot delay={0} />
          <PulseDot delay={200} />
          <PulseDot delay={400} />
        </View>
        <Text style={{ fontFamily: font(600), fontSize: 17, color: C.ink }}>Moving your points</Text>
        <Small style={{ fontSize: 13.5 }}>Do not close the app</Small>
      </View>
    </Screen>
  );
}
