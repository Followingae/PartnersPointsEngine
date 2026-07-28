import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

function Barcode() {
  const t = useTokens();
  // Deterministic bar widths.
  let bars: { x: number; w: number }[] = [];
  let x = 0;
  let s = 7;
  while (x < 280) {
    s = (s * 9301 + 49297) % 233280;
    const w = 1.5 + (s / 233280) * 4;
    bars.push({ x, w });
    x += w + 2 + (s % 3);
  }
  return (
    <Svg width="100%" height={60} viewBox="0 0 290 60" preserveAspectRatio="none">
      {bars.map((b, i) => (
        <Rect key={i} x={b.x} y={0} width={b.w} height={60} fill={t.ink} />
      ))}
    </Svg>
  );
}

export default function Voucher() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/vouchers'))} style={{ position: 'absolute', left: 22, width: 36, height: 36, borderRadius: 999, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', ...elevation(t.elevColor) }}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={2.2} strokeLinecap="round">
            <Path d="M6 6l12 12M18 6L6 18" />
          </Svg>
        </Pressable>
        <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.ink }}>Your voucher</Text>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
        <View style={{ width: '100%', backgroundColor: t.card, borderRadius: 28, overflow: 'hidden', ...elevation(t.elevColor) }}>
          <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: 24, paddingHorizontal: 22, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.display(800), fontSize: 9, color: BRAND.blue }}>CB</Text>
              </View>
              <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.9)' }}>Camel Bean</Text>
            </View>
            <Text style={{ fontFamily: font.display(700), fontSize: 28, color: '#fff', marginTop: 12 }}>Free flat white</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Any size · any branch</Text>
          </LinearGradient>

          {/* perforation */}
          <View style={{ height: 24, justifyContent: 'center' }}>
            <View style={{ position: 'absolute', left: -12, top: 0, width: 24, height: 24, borderRadius: 999, backgroundColor: t.canvas }} />
            <View style={{ position: 'absolute', right: -12, top: 0, width: 24, height: 24, borderRadius: 999, backgroundColor: t.canvas }} />
            <View style={{ marginHorizontal: 14, borderTopWidth: 2, borderColor: t.line, borderStyle: 'dashed' }} />
          </View>

          <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 26, alignItems: 'center' }}>
            <Barcode />
            <Text style={{ marginTop: 14, fontFamily: font.mono(600), fontSize: 15, letterSpacing: 2, color: t.ink }}>FLW·7K2D·CB</Text>
            <Text style={{ marginTop: 14, fontSize: 12.5, color: t.soft }}>Show at the till · valid until 30 Jul 2026</Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 26, paddingBottom: 16, alignItems: 'center' }}>
        <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.soft }}>Mark as used</Text>
      </View>
    </Screen>
  );
}
