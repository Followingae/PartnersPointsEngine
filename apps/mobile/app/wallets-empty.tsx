import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

export default function WalletsEmpty() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas, paddingTop: insets.top }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
        <View style={{ width: 120, height: 120, borderRadius: 30, borderWidth: 2, borderColor: t.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <Rect x={3} y={6} width={18} height={13} rx={3} />
            <Path d="M3 10h18" />
            <Circle cx={17} cy={14.5} r={1.3} />
          </Svg>
        </View>
        <Text style={{ marginTop: 26, fontFamily: font.display(700), fontSize: 26, letterSpacing: -0.6, color: t.ink }}>No wallets yet</Text>
        <Text style={{ marginTop: 12, fontSize: 15, color: t.soft, textAlign: 'center' }}>Join a merchant to open your first wallet and start earning points.</Text>
      </View>
      <View style={{ paddingHorizontal: 26, paddingBottom: 36 + insets.bottom }}>
        <Pressable onPress={() => router.push('/discover')} style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>Find a merchant</Text>
        </Pressable>
      </View>
    </View>
  );
}
