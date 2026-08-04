import { useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { C } from '@/lib/tokens';

/**
 * The celebration.
 *
 * It lived inside the points-landed screen, which meant the one moment that
 * deserves it more — a stamp card finishing — got a line of grey text instead.
 * Same animation, now available wherever something is genuinely worth
 * celebrating.
 *
 * Deliberately not used for anything routine. Confetti on every earn is
 * confetti nobody sees.
 */
const H = Dimensions.get('window').height;

const TONES = [C.orange, C.purple, C.green, C.blue, C.pink, C.lime];

const PIECES = Array.from({ length: 14 }, (_, i) => ({
  left: 5 + i * 6.43,
  height: [8, 11, 14][i % 3] as number,
  tone: TONES[i % TONES.length] as string,
  duration: 2000 + (i % 5) * 300,
  delay: (i % 7) * 180,
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

/** Fills its parent. `pointerEvents: none` so it never eats a tap. */
export function Confetti({ active = true }: { active?: boolean }) {
  if (!active) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      {PIECES.map((p, i) => (
        <Piece key={i} {...p} />
      ))}
    </View>
  );
}
