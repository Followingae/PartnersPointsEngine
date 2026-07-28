import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

export default function ConvertFailure() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,4,30,0.5)' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 30 + insets.bottom, alignItems: 'center' }}>
        <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: t.line, marginBottom: 18 }} />
        <View style={{ width: 74, height: 74, borderRadius: 37, backgroundColor: 'rgba(242,98,46,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={BRAND.coral} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 8v5M12 16.5v.5" /><Circle cx={12} cy={12} r={9} /></Svg>
        </View>
        <Text style={{ marginTop: 18, fontFamily: font.display(700), fontSize: 24, letterSpacing: -0.5, color: t.ink }}>Conversion paused</Text>
        <Text style={{ marginTop: 10, fontSize: 14.5, lineHeight: 21, color: t.soft, textAlign: 'center', fontFamily: font.sans(400) }}>This merchant&apos;s daily Lulu allowance is topped up. Try again tomorrow — your points are safe.</Text>
        <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(191,242,5,0.24)', paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: '#4d5c00' }}>✓ No points were deducted</Text>
        </View>
        <Pressable style={{ width: '100%', marginTop: 22, backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontFamily: font.sans(700), fontSize: 16 }}>Notify me when available</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/home')} style={{ marginTop: 14 }} hitSlop={8}>
          <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.soft }}>Back to wallet</Text>
        </Pressable>
      </View>
    </View>
  );
}
