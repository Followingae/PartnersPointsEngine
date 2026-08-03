import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Body, Button, H1 } from '@/components/UI';
import { C, SP, font } from '@/lib/tokens';

/**
 * 28 · The reassuring dead end after a scan that led nowhere.
 *
 * The design called this "Code expired" and said codes refresh every twelve
 * seconds. Ours don't — the customer's own code is their membership id and
 * deliberately doesn't rotate, so that copy described a system nobody built.
 * The moment it stands in for is real though, and it is the one the scanner
 * needed: a code that resolves to nothing. What matters either way is the
 * second line — that nothing happened — so that survives unchanged.
 */
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
        <H1 style={{ marginTop: 32, fontSize: 30, lineHeight: 35, letterSpacing: -0.75, textAlign: 'center' }}>
          That code didn’t work
        </H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22.5, textAlign: 'center' }}>
          No brand on Partners Points uses it. Nothing was charged and no points moved.
        </Body>
      </View>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button label="Scan again" onPress={() => router.replace('/scan/camera')} style={{ height: 58, borderRadius: 18 }} />
        <Pressable onPress={() => router.replace('/home')} style={{ paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted }}>Back to cards</Text>
        </Pressable>
      </View>
    </View>
  );
}
