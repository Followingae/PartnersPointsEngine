import { useEffect } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, ErrorState, H1, Loading, pts } from '@/components/UI';
import { AddToWallet } from '@/components/AddToWallet';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { getCards } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, SP, font, shadow } from '@/lib/tokens';

/** 24 · Joined — confetti, the new card at zero, and the wallet hand-off. */

const H = Dimensions.get('window').height;
const CONFETTI_TONES = [C.orange, C.purple, C.green, C.blue, C.pink, C.lime];
const PIECES = Array.from({ length: 12 }, (_, i) => ({
  left: 7 + i * 7.6,
  height: [8, 11, 14][i % 3] as number,
  tone: CONFETTI_TONES[i % CONFETTI_TONES.length] as string,
  duration: 2200 + (i % 5) * 300,
  delay: (i % 6) * 200,
}));

function Piece({ left, height, tone, duration, delay }: (typeof PIECES)[number]) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, [v, duration, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -20 + v.value * (H + 40) }, { rotate: `${v.value * 540}deg` }],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: `${left}%`, width: 8, height, borderRadius: 2, backgroundColor: tone },
        style,
      ]}
    />
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function JoinSuccess() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const brandId = one(useLocalSearchParams<{ id?: string }>().id);

  // The membership was created by the sheet before this screen; the card it
  // produced is read back so the celebration shows the real thing.
  const { data, loading, error, signedOut, refresh } = useAsync(getCards);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = data?.find((c) => c.brandId === brandId);
  const tone = brandId ? brandColor(brandId, card?.branding) : C.wash;
  const fg = brandFg(tone);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        {PIECES.map((p, i) => <Piece key={i} {...p} />)}
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: SP.gutter }}>
        {loading ? (
          <Loading />
        ) : error && !card ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !card ? (
          <>
            <H1 style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>Card added</H1>
            <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22.5 }}>
              It will show up in your cards in a moment.
            </Body>
          </>
        ) : (
          <>
            <View
              style={{
                height: 200, borderRadius: 26, padding: 24, backgroundColor: tone,
                justifyContent: 'space-between', ...shadow.raised,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: fg }}>{brandInitials(card.brandName)}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: font(600), fontSize: 17, lineHeight: 24, letterSpacing: -0.17, color: fg }}>{card.brandName}</Text>
                </View>
                {card.tier ? (
                  <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: fg }}>{card.tier}</Text>
                ) : null}
              </View>

              <View style={{ gap: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ fontFamily: font(600), fontSize: 48, lineHeight: 55, letterSpacing: -1.44, color: fg }}>{pts(Number(card.available))}</Text>
                  <Text style={{ fontFamily: font(500), fontSize: 14, lineHeight: 20, color: fg }}>pts</Text>
                </View>
                <View style={{ gap: 9 }}>
                  <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: fg }}>Collect {card.pointsCode}</Text>
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.26)' }}>
                    <View style={{ height: 3, width: `${Math.max(0, Math.min(100, card.progressPct))}%`, borderRadius: 2, backgroundColor: '#fff' }} />
                  </View>
                </View>
              </View>
            </View>

            <H1 style={{ marginTop: 36, fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>Card added</H1>
            <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22.5 }}>
              Keep it on your phone so the till can find you without the app.
            </Body>

            <AddToWallet membershipId={card.membershipId} />
          </>
        )}
      </View>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button label="Show my QR" onPress={() => router.replace('/scan')} style={{ height: 58, borderRadius: 18 }} />
        <Pressable onPress={() => router.replace('/home')} style={{ paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted }}>Back to cards</Text>
        </Pressable>
      </View>
    </View>
  );
}
