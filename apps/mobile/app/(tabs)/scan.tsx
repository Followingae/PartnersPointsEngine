import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

// Cast sidesteps a @types/react 19.0↔19.2 skew between the app pin and reanimated's
// resolved types (not a runtime issue). Align @types/react at the workspace to drop it.
const AnimatedCircle = Animated.createAnimatedComponent(Circle) as ComponentType<Record<string, unknown>>;
const RADIUS = 130;
const CIRC = 2 * Math.PI * RADIUS;
const PERIOD = 12; // seconds per QR cycle

/** Deterministic pseudo-random QR-ish matrix (mock) that changes per seed. */
function useMatrix(seed: number) {
  return useMemo(() => {
    const N = 21;
    let s = seed * 9301 + 49297;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const cells: { x: number; y: number }[] = [];
    const finder = (cx: number, cy: number) => (cx < 7 && cy < 7) || (cx >= N - 7 && cy < 7) || (cx < 7 && cy >= N - 7);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (finder(x, y)) continue; // finders drawn separately
        if (rnd() > 0.55) cells.push({ x, y });
      }
    return { N, cells };
  }, [seed]);
}

function FinderSquare({ x, y, cell }: { x: number; y: number; cell: number }) {
  return (
    <>
      <Rect x={x * cell} y={y * cell} width={cell * 7} height={cell * 7} rx={cell} fill="#262626" />
      <Rect x={(x + 1) * cell} y={(y + 1) * cell} width={cell * 5} height={cell * 5} rx={cell * 0.6} fill="#fff" />
      <Rect x={(x + 2) * cell} y={(y + 2) * cell} width={cell * 3} height={cell * 3} rx={cell * 0.4} fill="#262626" />
    </>
  );
}

export default function ScanTab() {
  const t = useTokens();
  const router = useRouter();
  const [seed, setSeed] = useState(1);
  const [left, setLeft] = useState(PERIOD);
  const progress = useSharedValue(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: PERIOD * 1000, easing: Easing.linear }), -1, false);
    const tick = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const rem = PERIOD - (elapsed % PERIOD);
      setLeft(Math.ceil(rem));
      if (rem > PERIOD - 0.3) setSeed((s) => s + 1); // refresh near cycle start
    }, 250);
    return () => clearInterval(tick);
  }, [progress]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: CIRC * progress.value }));
  const { N, cells } = useMatrix(seed);
  const QR = 172;
  const cell = QR / N;

  return (
    <Screen pad scroll={false}>
      <View style={{ alignItems: 'center', paddingHorizontal: 22, paddingTop: 8 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 22, color: t.ink }}>Scan to earn</Text>
        <Text style={{ fontSize: 13.5, color: t.soft, marginTop: 6 }}>Show this to the cashier</Text>
      </View>

      {/* segmented control */}
      <View style={{ flexDirection: 'row', backgroundColor: t.chip, borderRadius: 999, padding: 4, marginHorizontal: 22, marginTop: 16 }}>
        <View style={{ flex: 1, alignItems: 'center', backgroundColor: t.card, borderRadius: 999, paddingVertical: 9, ...elevation(t.elevColor) }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: t.ink }}>My QR</Text>
        </View>
        <Pressable style={{ flex: 1, alignItems: 'center', paddingVertical: 9 }} onPress={() => router.push('/scan/camera')}>
          <Text style={{ fontFamily: font.sans(600), fontSize: 13, color: t.soft }}>Scan a code</Text>
        </Pressable>
      </View>

      {/* merchant selector */}
      <View style={{ alignItems: 'center', marginTop: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingVertical: 7, paddingLeft: 11, paddingRight: 9, borderRadius: 999, ...elevation(t.elevColor) }}>
          <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.display(800), fontSize: 11, color: '#fff' }}>CB</Text>
          </LinearGradient>
          <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: t.ink }}>Camel Bean</Text>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2.4} strokeLinecap="round">
            <Path d="M6 9l6 6 6-6" />
          </Svg>
        </View>
      </View>

      {/* QR + ring */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 }}>
        <View style={{ width: 284, height: 284, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={284} height={284} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={142} cy={142} r={RADIUS} fill="none" stroke={t.line} strokeWidth={5} />
            <AnimatedCircle cx={142} cy={142} r={RADIUS} fill="none" stroke={BRAND.lime} strokeWidth={5} strokeLinecap="round" strokeDasharray={CIRC} animatedProps={ringProps} />
          </Svg>
          <View style={{ width: 212, height: 212, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...elevation(t.elevColor) }}>
            <Svg width={QR} height={QR}>
              {cells.map((c, i) => (
                <Rect key={i} x={c.x * cell} y={c.y * cell} width={cell} height={cell} fill="#262626" />
              ))}
              <FinderSquare x={0} y={0} cell={cell} />
              <FinderSquare x={N - 7} y={0} cell={cell} />
              <FinderSquare x={0} y={N - 7} cell={cell} />
            </Svg>
            <View style={{ position: 'absolute', width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: '#fff' }}>
              <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 33, height: 33, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.display(800), fontSize: 12, color: '#fff' }}>CB</Text>
              </LinearGradient>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 22, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(191,242,5,0.24)', paddingVertical: 7, paddingHorizontal: 15, borderRadius: 999 }}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: BRAND.lime }} />
            <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: '#4d5c00' }}>Refreshes in {left}s · single-use</Text>
          </View>
          <Text style={{ marginTop: 14, fontFamily: font.mono(600), fontSize: 14, letterSpacing: 1, color: t.soft }}>CB·MAYA·4821</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 22, paddingBottom: 8, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={1.9} strokeLinecap="round">
            <Circle cx={12} cy={12} r={4} />
            <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
          </Svg>
          <Text style={{ fontSize: 12.5, color: t.faint }}>Screen brightened for scanning</Text>
        </View>
      </View>
    </Screen>
  );
}
