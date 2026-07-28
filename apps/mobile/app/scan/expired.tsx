import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Body, Button, H1 } from '@/components/UI';
import { C, SP, font } from '@/lib/tokens';

/** 28 · Code expired — the reassuring dead end when a code times out. */

export default function ScanExpired() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <View style={{ width: 88, height: 88, borderRadius: 999, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 6l12 12M18 6L6 18" />
          </Svg>
        </View>
        <H1 style={{ marginTop: 32, fontSize: 30, lineHeight: 35, letterSpacing: -0.75, textAlign: 'center' }}>Code expired</H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22.5, textAlign: 'center' }}>
          Codes refresh every 12 seconds. Nothing was charged and no points moved.
        </Body>
      </View>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button label="Show a new code" onPress={() => router.replace('/scan')} style={{ height: 58, borderRadius: 18 }} />
        <Pressable onPress={() => router.replace('/home')} style={{ paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted }}>Back to cards</Text>
        </Pressable>
      </View>
    </View>
  );
}
