import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Small } from '@/components/UI';
import { ApiError, convertPoints } from '@/lib/api';
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

/**
 * Where the transfer actually happens.
 *
 * The call is fired exactly once per mount and guarded by a ref: `convertPoints`
 * mints a fresh idempotency key per call, so a second fire would be a second
 * transfer, not a deduplicated retry. The server settles synchronously and
 * reports `completed` or `failed`; a failure there has already voided the hold
 * and refunded the merchant's allowance, so nothing is left half-done.
 */
export default function ConvertProcessing() {
  const router = useRouter();
  const { brandId, amount } = useLocalSearchParams<{ brandId?: string; amount?: string }>();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const points = Math.max(1, Number(amount ?? 0) || 0);

    (async () => {
      if (!brandId) {
        router.replace({ pathname: '/convert/failure', params: { message: 'That transfer is missing its card.' } });
        return;
      }
      try {
        const result = await convertPoints(brandId, points);
        if (result.status === 'completed') {
          router.replace({
            pathname: '/convert/success',
            params: {
              brandId,
              amount: result.sourcePoints,
              partnerPoints: result.partnerPoints,
            },
          });
          return;
        }
        // A settled-but-not-completed transfer has already been unwound server
        // side. The response carries no reason for it, so the screen says only
        // what it can stand behind.
        router.replace({
          pathname: '/convert/failure',
          params: {
            brandId,
            amount: result.sourcePoints,
            outcome: 'failed',
            message: 'The partner did not confirm the transfer.',
          },
        });
      } catch (e) {
        if (e instanceof ApiError && e.isAuth) {
          router.replace('/onboarding/phone');
          return;
        }
        // The server rejecting the transfer means nothing moved. A request that
        // never came back means nobody knows — those are told apart downstream
        // so the failure screen never promises a refund it can't vouch for.
        router.replace({
          pathname: '/convert/failure',
          params: {
            brandId,
            amount: String(points),
            outcome: e instanceof ApiError && e.status === 0 ? 'unknown' : 'failed',
            message: e instanceof Error ? e.message : 'Something went wrong',
          },
        });
      }
    })();
  }, [brandId, amount, router]);

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PulseDot delay={0} />
          <PulseDot delay={200} />
          <PulseDot delay={400} />
        </View>
        <Text style={{ fontFamily: font(600), fontSize: 17, lineHeight: 24, color: C.ink }}>Moving your points</Text>
        <Small style={{ fontSize: 13.5, lineHeight: 19 }}>Do not close the app</Small>
      </View>
    </Screen>
  );
}
