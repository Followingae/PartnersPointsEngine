import { useEffect } from 'react';
import { Dimensions, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, pts } from '@/components/UI';
import { C, SP, font, shadow } from '@/lib/tokens';

/** 27 · Points landed — the confirmation after a successful earn. */

const H = Dimensions.get('window').height;
const CONFETTI_TONES = [C.orange, C.purple, C.green, C.blue, C.pink, C.lime];
const PIECES = Array.from({ length: 14 }, (_, i) => ({
  left: 5 + i * 6.43,
  height: [8, 11, 14][i % 3] as number,
  tone: CONFETTI_TONES[i % CONFETTI_TONES.length] as string,
  duration: 2000 + (i % 5) * 300,
  delay: (i % 7) * 180,
}));

// TODO(api): the earn event returned by POST /customer/scan
const EARN = {
  points: 120,
  code: 'CB',
  brand: 'Camel Bean',
  tier: 'Gold',
  balance: 2043,
  toNext: '320 to Black',
  progress: 0.82,
  footnote: 'Camel Bean · JLT · AED 42.00',
};

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

export default function ScanResult() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        {PIECES.map((p, i) => <Piece key={i} {...p} />)}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.gutter }}>
        <Text style={{ fontFamily: font(600), fontSize: 72, lineHeight: 80, letterSpacing: -3.6, color: C.ink }}>+{EARN.points}</Text>
        <Text style={{ marginTop: 10, fontFamily: font(500), fontSize: 13, lineHeight: 18, letterSpacing: 1.3, textTransform: 'uppercase', color: C.soft }}>points</Text>

        <View
          style={{
            marginTop: 38, width: '100%', height: 200, borderRadius: 26, padding: 24,
            backgroundColor: C.orange, justifyContent: 'space-between', ...shadow.raised,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(21,21,15,.15)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>{EARN.code}</Text>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: font(600), fontSize: 17, lineHeight: 24, letterSpacing: -0.17, color: C.ink }}>{EARN.brand}</Text>
            </View>
            <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: C.ink }}>{EARN.tier}</Text>
          </View>

          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={{ fontFamily: font(600), fontSize: 48, lineHeight: 55, letterSpacing: -1.44, color: C.ink }}>{pts(EARN.balance)}</Text>
              <Text style={{ fontFamily: font(500), fontSize: 14, lineHeight: 20, color: C.ink }}>pts</Text>
            </View>
            <View style={{ gap: 9 }}>
              <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: C.ink }}>{EARN.toNext}</Text>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(21,21,15,.22)' }}>
                <View style={{ height: 3, width: `${EARN.progress * 100}%`, borderRadius: 2, backgroundColor: '#fff' }} />
              </View>
            </View>
          </View>
        </View>

        <Text style={{ marginTop: 24, fontFamily: font(500), fontSize: 14, lineHeight: 20, color: C.muted }}>{EARN.footnote}</Text>
      </View>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button label="Done" onPress={() => router.replace('/home')} style={{ height: 58, borderRadius: 18 }} />
      </View>
    </View>
  );
}
