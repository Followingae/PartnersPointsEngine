import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { Progress, Screen } from '@/components/UI';
import { C, font, shadow } from '@/lib/tokens';

/**
 * 25 · My QR (live) — the screen the customer holds up at the till.
 *
 * The code is a short-lived member token: it redraws every PERIOD seconds so a
 * photographed screen is worthless a few moments later.
 */

const PERIOD = 12; // seconds — matches the "codes refresh every 12 seconds" copy
const BOX = 252;
const QR = 196;
const MODULES = 25;
const CELL = QR / MODULES;

type Wallet = { id: string; code: string; name: string; tile: string; fg: string; memberId: string };

// TODO(api): GET /customer/memberships — the wallets this member can present
const WALLETS: Wallet[] = [
  { id: 'camel-bean', code: 'CB', name: 'Camel Bean', tile: C.orange, fg: C.ink, memberId: '4821 0247' },
  { id: 'bloom-coffee', code: 'BC', name: 'Bloom Coffee', tile: C.blue, fg: '#fff', memberId: '4821 5518' },
];

/**
 * Placeholder module grid — deterministic per seed, with the three finder
 * squares a scanner would look for. Not a real encoder; the signed token from
 * the API gets encoded here later.
 */
function useModules(seed: number) {
  return useMemo(() => {
    let s = (seed * 48271 + 11) % 2147483647;
    const rnd = () => {
      s = (s * 48271) % 2147483647;
      return s / 2147483647;
    };
    const reserved = (x: number, y: number) =>
      (x < 8 && y < 8) || (x >= MODULES - 8 && y < 8) || (x < 8 && y >= MODULES - 8);
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < MODULES; y++) {
      for (let x = 0; x < MODULES; x++) {
        if (reserved(x, y)) continue;
        // timing lines keep the grid reading as a code rather than as noise
        if (x === 6 || y === 6) {
          if ((x + y) % 2 === 0) cells.push({ x, y });
          continue;
        }
        if (rnd() > 0.52) cells.push({ x, y });
      }
    }
    return cells;
  }, [seed]);
}

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <>
      <Rect x={x * CELL} y={y * CELL} width={CELL * 7} height={CELL * 7} rx={CELL} fill={C.ink} />
      <Rect x={(x + 1) * CELL} y={(y + 1) * CELL} width={CELL * 5} height={CELL * 5} rx={CELL * 0.6} fill={C.surface} />
      <Rect x={(x + 2) * CELL} y={(y + 2) * CELL} width={CELL * 3} height={CELL * 3} rx={CELL * 0.4} fill={C.ink} />
    </>
  );
}

export default function MyQrTab() {
  const router = useRouter();
  const [walletIndex, setWalletIndex] = useState(0);
  const [seed, setSeed] = useState(1);
  const [left, setLeft] = useState(PERIOD);
  const wallet = WALLETS[walletIndex] as Wallet;
  const cells = useModules(seed + walletIndex * 97);

  useEffect(() => {
    const id = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          // TODO(api): POST /customer/tokens — mint the next signed member token
          setSeed((s) => s + 1);
          return PERIOD;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Screen scroll={false} bottomGap={96} background={C.surface}>
      <View style={{ flexDirection: 'row', backgroundColor: C.canvas, borderRadius: 999, padding: 4, marginTop: 14 }}>
        <View
          style={{
            flex: 1, alignItems: 'center', paddingVertical: 10,
            backgroundColor: C.surface, borderRadius: 999,
            shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
          }}
        >
          <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>My code</Text>
        </View>
        <Pressable onPress={() => router.push('/scan/camera')} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
          <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: C.muted }}>Scan a code</Text>
        </Pressable>
      </View>

      {/* TODO(api): a proper wallet picker sheet — this cycles the sample wallets */}
      <View style={{ alignItems: 'center', marginTop: 22 }}>
        <Pressable
          onPress={() => setWalletIndex((i) => (i + 1) % WALLETS.length)}
          style={({ pressed }) => [
            {
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: C.canvas, borderRadius: 999,
              paddingLeft: 10, paddingRight: 14, paddingVertical: 8,
            },
            pressed ? { opacity: 0.8 } : null,
          ]}
        >
          <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: wallet.tile, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font(600), fontSize: 10, lineHeight: 14, color: wallet.fg }}>{wallet.code}</Text>
          </View>
          <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>{wallet.name}</Text>
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 9l6 6 6-6" />
          </Svg>
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: BOX, height: BOX, borderRadius: 28, backgroundColor: C.surface,
            alignItems: 'center', justifyContent: 'center', ...shadow.card,
          }}
        >
          <Svg width={QR} height={QR}>
            {cells.map((c, i) => (
              <Rect key={i} x={c.x * CELL} y={c.y * CELL} width={CELL} height={CELL} fill={C.ink} />
            ))}
            <Finder x={0} y={0} />
            <Finder x={MODULES - 7} y={0} />
            <Finder x={0} y={MODULES - 7} />
          </Svg>
        </View>

        <View style={{ width: BOX, marginTop: 26 }}>
          <Progress value={left} total={PERIOD} color={C.ink} height={4} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 12 }}>
            <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: C.muted }}>Refreshes in {left}s</Text>
            <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: C.soft, letterSpacing: 0.52 }}>{wallet.memberId}</Text>
          </View>
          {/* TODO(api): raise screen brightness while this tab is focused */}
          <Text style={{ marginTop: 16, textAlign: 'center', fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.soft }}>
            Screen brightened for the scanner
          </Text>
        </View>
      </View>
    </Screen>
  );
}
