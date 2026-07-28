import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { C, R, SP, font } from '@/lib/tokens';

/**
 * 26 · Scanner — viewfinder for join codes, vouchers and pay-and-earn.
 *
 * There is no camera dependency in this app, so the preview is the framing UI
 * only and the manual-entry path carries the flow.
 */

const HOLE = 236;
const MASK = 'rgba(21,21,15,.68)';

export default function ScanCamera() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');

  const submit = () => {
    // TODO(api): POST /customer/scan { code } and branch on the response kind
    router.replace('/scan/result');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.slate }}>
      {/* Mask with a clear square punched out of it. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <View style={{ flex: 44, backgroundColor: MASK }} />
        <View style={{ height: HOLE, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: MASK }} />
          <View style={{ width: HOLE, borderRadius: 28, borderWidth: 2, borderColor: 'rgba(255,255,255,.9)' }} />
          <View style={{ flex: 1, backgroundColor: MASK }} />
        </View>
        <View style={{ flex: 56, backgroundColor: MASK }} />
      </View>

      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: SP.gutter }}>
        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,.14)', borderRadius: 999, padding: 4 }}>
          <Pressable onPress={() => router.back()} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,.7)' }}>My code</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: '#fff', borderRadius: 999 }}>
            <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>Scan a code</Text>
          </View>
        </View>
      </View>

      <View style={{ position: 'absolute', left: SP.gutter, right: SP.gutter, bottom: 120, alignItems: 'center' }}>
        <Text style={{ fontFamily: font(600), fontSize: 16, lineHeight: 22, color: '#fff' }}>Point at the code on the till</Text>
        <Text style={{ marginTop: 8, fontFamily: font(500), fontSize: 13, lineHeight: 18, color: '#fff' }}>Join codes, vouchers and pay-and-earn</Text>
        <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: font(500), fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,.6)' }}>
          Live preview needs a development build — enter the code by hand for now.
        </Text>
      </View>

      {manual ? (
        <View style={{ position: 'absolute', left: SP.gutter, right: SP.gutter, bottom: 36 + insets.bottom }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            onSubmitEditing={submit}
            autoFocus
            autoCapitalize="characters"
            placeholder="Code from the till"
            placeholderTextColor="rgba(255,255,255,.45)"
            style={{
              backgroundColor: 'rgba(255,255,255,.16)', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16,
              fontFamily: font(600), fontSize: 15, lineHeight: 21, color: '#fff', letterSpacing: 1.2,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <Pressable
              onPress={() => setManual(false)}
              style={{ flex: 1, backgroundColor: 'rgba(255,255,255,.16)', borderRadius: 18, paddingVertical: 15, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: '#fff' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              style={{ flex: 1, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 15, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }}>Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ position: 'absolute', left: SP.gutter, right: SP.gutter, bottom: 36 + insets.bottom, flexDirection: 'row', gap: 12 }}>
          {/* TODO(api): torch needs the camera module — inert until then */}
          <View
            style={{
              flex: 1, backgroundColor: 'rgba(255,255,255,.16)', borderRadius: 18, paddingVertical: 15,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
            }}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 3h6l-1 6h3l-8 12 2-9H8z" />
            </Svg>
            <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: '#fff' }}>Torch</Text>
          </View>
          <Pressable
            onPress={() => setManual(true)}
            style={{ flex: 1, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }}>Enter code</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={{ position: 'absolute', right: SP.gutter, top: insets.top + 76, padding: 6, borderRadius: R.small }}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth={2} strokeLinecap="round">
          <Path d="M6 6l12 12M18 6L6 18" />
        </Svg>
      </Pressable>
    </View>
  );
}
