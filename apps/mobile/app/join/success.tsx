import { useEffect } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, H1 } from '@/components/UI';
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

type Card = { code: string; name: string; tier: string; tone: string; fg: string; earn: string };

// TODO(api): the membership returned by POST /customer/memberships
const CARDS: Record<string, Card> = {
  'bloom-coffee': { code: 'BC', name: 'Bloom Coffee', tier: 'Green', tone: C.blue, fg: '#fff', earn: 'Earn 2 pts per AED' },
  'camel-bean': { code: 'CB', name: 'Camel Bean', tier: 'Bronze', tone: C.orange, fg: C.ink, earn: 'Earn 1 pt per AED' },
};

const FALLBACK = CARDS['bloom-coffee'] as Card;

export default function JoinSuccess() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const card = (id ? CARDS[id] : undefined) ?? FALLBACK;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        {PIECES.map((p, i) => <Piece key={i} {...p} />)}
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: SP.gutter }}>
        <View
          style={{
            height: 200, borderRadius: 26, padding: 24, backgroundColor: card.tone,
            justifyContent: 'space-between', ...shadow.raised,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font(600), fontSize: 13, color: card.fg }}>{card.code}</Text>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: font(600), fontSize: 17, letterSpacing: -0.17, color: card.fg }}>{card.name}</Text>
            </View>
            <Text style={{ fontFamily: font(500), fontSize: 13, color: card.fg }}>{card.tier}</Text>
          </View>

          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={{ fontFamily: font(600), fontSize: 48, lineHeight: 48, letterSpacing: -1.44, color: card.fg }}>0</Text>
              <Text style={{ fontFamily: font(500), fontSize: 14, color: card.fg }}>pts</Text>
            </View>
            <View style={{ gap: 9 }}>
              <Text style={{ fontFamily: font(500), fontSize: 13, color: card.fg }}>{card.earn}</Text>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.26)' }}>
                <View style={{ height: 3, width: '0%', borderRadius: 2, backgroundColor: '#fff' }} />
              </View>
            </View>
          </View>
        </View>

        <H1 style={{ marginTop: 36, fontSize: 30, letterSpacing: -0.75 }}>Card added</H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22.5 }}>
          Keep it on your phone so the till can find you without the app.
        </Body>

        {/* TODO(api): PassKit pass from GET /customer/memberships/{id}/pass */}
        <View
          style={{
            marginTop: 24, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: C.hairline,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: font(500), fontSize: 11.5, color: C.soft }}>Add to Apple Wallet · official badge</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button label="Show my QR" onPress={() => router.replace('/scan')} style={{ height: 58, borderRadius: 18 }} />
        <Pressable onPress={() => router.replace('/home')} style={{ paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: font(600), fontSize: 15, color: C.muted }}>Back to cards</Text>
        </Pressable>
      </View>
    </View>
  );
}
