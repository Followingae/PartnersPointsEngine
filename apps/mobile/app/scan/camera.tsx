import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { BRAND, font } from '@/lib/tokens';

export default function CameraScanner() {
  const router = useRouter();
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [y]);

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (y.value - 0.5) * 200 }] }));

  return (
    <Screen scroll={false} background="#161a1f">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, height: 46 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/scan'))} style={iconBtn}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
            <Path d="M6 6l12 12M18 6L6 18" />
          </Svg>
        </Pressable>
        <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: '#fff' }}>Scan a code</Text>
        <View style={iconBtn}>
          <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 7h3l1-2h6l1 2h3v12H5z" />
            <Circle cx={12} cy={13} r={3.2} />
          </Svg>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={() => router.push('/scan/result')}>
          <View style={{ width: 236, height: 236 }}>
            <View style={[corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 }]} />
            <View style={[corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 }]} />
            <View style={[corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 }]} />
            <View style={[corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 }]} />
            <Animated.View style={[{ position: 'absolute', left: 14, right: 14, top: '50%', height: 3, backgroundColor: BRAND.lime, borderRadius: 2 }, lineStyle]} />
          </View>
        </Pressable>
        <Text style={{ marginTop: 30, fontSize: 14, color: 'rgba(255,255,255,0.78)', textAlign: 'center', maxWidth: 240 }}>
          Point at a merchant join code, voucher or pay-and-earn QR.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 26, paddingBottom: 38, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', paddingVertical: 13, paddingHorizontal: 22, borderRadius: 999 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 14, color: '#fff' }}>⌨ Enter code manually</Text>
        </View>
      </View>
    </Screen>
  );
}

const iconBtn = { width: 36, height: 36, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const };
const corner = { position: 'absolute' as const, width: 46, height: 46, borderColor: BRAND.lime };
