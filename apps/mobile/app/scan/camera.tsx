import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { getDiscoverBrands, type DiscoverBrand } from '@/lib/api';
import { resolveBrand } from '@/lib/scan-code';
import { useAsync } from '@/lib/useAsync';
import { C, R, SP, font } from '@/lib/tokens';

/**
 * 26 · Scanner — the viewfinder for a brand's code at the till.
 *
 * The camera is real, and so is what it resolves to: a scanned value is matched
 * against the brands the wallet can see, by id, slug or points code, whether it
 * arrives as a link, a deep link or the bare code. A hit goes to the join sheet
 * — which is where joining is disclosed — or straight to the card when it's one
 * they already hold. Anything else is a dead end rather than a guess.
 *
 * Typing the code by hand takes exactly the same path, so a scratched QR or a
 * refused camera permission isn't the end of the road.
 */

const HOLE = 236;
const MASK = 'rgba(21,21,15,.68)';

/** A QR held in frame fires continuously; one resolution per code is enough. */
const RESCAN_MS = 1_500;

function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: active ? '#fff' : 'transparent',
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          fontFamily: font(active ? 600 : 500),
          fontSize: 13,
          lineHeight: 18,
          color: active ? C.ink : 'rgba(255,255,255,.7)',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Action({ label, tone, icon, onPress }: {
  label: string;
  tone: 'light' | 'dark';
  icon?: ReactNode;
  onPress?: () => void;
}) {
  const light = tone === 'light';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          backgroundColor: light ? '#fff' : 'rgba(255,255,255,.16)',
          borderRadius: 18,
          paddingVertical: 15,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
        },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      {icon}
      <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: light ? C.ink : '#fff' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ScanCamera() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [torch, setTorch] = useState(false);
  const [code, setCode] = useState('');
  const [failed, setFailed] = useState<string | null>(null);

  // Loaded up front so a scan resolves instantly rather than making someone
  // hold the phone still through a round trip.
  const { data: brands } = useAsync<DiscoverBrand[]>(getDiscoverBrands, []);

  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const resolve = useCallback(
    (raw: string) => {
      if (busy.current) return;
      busy.current = true;
      timer.current = setTimeout(() => {
        busy.current = false;
      }, RESCAN_MS);

      const brand = resolveBrand(raw, brands ?? []);
      // 28 · the dead end. Nothing was charged and nothing moved.
      if (!brand) {
        router.replace('/scan/expired');
        return;
      }
      // Joining shares their name and number with the brand, and the join sheet
      // is where that is said out loud — so a new brand always goes through it.
      router.replace(brand.joined ? `/wallet/${brand.brandId}` : `/join/${brand.brandId}`);
    },
    [brands, router],
  );

  const submit = () => {
    const raw = code.trim();
    if (!raw) return;
    if (!resolveBrand(raw, brands ?? [])) {
      setFailed('No brand uses that code.');
      return;
    }
    resolve(raw);
  };

  const granted = permission?.granted === true;

  return (
    <View style={{ flex: 1, backgroundColor: C.slate }}>
      {granted ? (
        <CameraView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'code128'] }}
          onBarcodeScanned={({ data }) => resolve(data)}
        />
      ) : null}

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
          <Pill label="My code" onPress={() => router.back()} />
          <Pill label="Scan a code" active />
        </View>
      </View>

      <View style={{ position: 'absolute', left: SP.gutter, right: SP.gutter, bottom: 120, alignItems: 'center' }}>
        <Text style={{ fontFamily: font(600), fontSize: 16, lineHeight: 22, color: '#fff' }}>
          Point at the brand’s code
        </Text>
        <Text style={{ marginTop: 8, fontFamily: font(500), fontSize: 13, lineHeight: 18, color: '#fff' }}>
          The one at the till or on the counter
        </Text>
        {!granted ? (
          <Text
            style={{
              marginTop: 10, textAlign: 'center', fontFamily: font(500),
              fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,.6)',
            }}
          >
            {permission?.canAskAgain === false
              ? 'Camera access is off for this app — enter the code by hand, or turn it on in Settings.'
              : 'Waiting for camera access — you can enter the code by hand instead.'}
          </Text>
        ) : null}
      </View>

      {manual ? (
        // Anchored to the keyboard rather than to the bottom of the screen —
        // the Continue button is directly under the field being typed into.
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : undefined}
          style={{ position: 'absolute', left: SP.gutter, right: SP.gutter, bottom: 36 + insets.bottom }}
        >
          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setFailed(null);
            }}
            onSubmitEditing={submit}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Code from the till"
            placeholderTextColor="rgba(255,255,255,.45)"
            style={{
              backgroundColor: 'rgba(255,255,255,.16)', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16,
              fontFamily: font(600), fontSize: 15, lineHeight: 21, color: '#fff', letterSpacing: 1.2,
            }}
          />
          {failed ? (
            <Text style={{ marginTop: 10, fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: '#fff' }}>
              {failed}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <Action
              label="Cancel"
              tone="dark"
              onPress={() => {
                setManual(false);
                setFailed(null);
              }}
            />
            <Action label="Continue" tone="light" onPress={submit} />
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View
          style={{
            position: 'absolute', left: SP.gutter, right: SP.gutter,
            bottom: 36 + insets.bottom, flexDirection: 'row', gap: 12,
          }}
        >
          <Action
            label={torch ? 'Torch on' : 'Torch'}
            tone="dark"
            {...(granted ? { onPress: () => setTorch((t) => !t) } : {})}
            icon={
              <Svg width={18} height={18} viewBox="0 0 24 24" fill={torch ? '#fff' : 'none'} stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M9 3h6l-1 6h3l-8 12 2-9H8z" />
              </Svg>
            }
          />
          <Action label="Enter code" tone="light" onPress={() => setManual(true)} />
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
