import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, H2 } from '@/components/UI';
import { C, SP, font } from '@/lib/tokens';

/** 23 · Join confirmation — the brand behind a scrim, terms in a bottom sheet. */

type Terms = { name: string; tone: string; rows: { label: string; value: string }[] };

// TODO(api): GET /customer/merchants/{id}/programme
const PROGRAMMES: Record<string, Terms> = {
  'bloom-coffee': {
    name: 'Bloom Coffee', tone: C.blue,
    rows: [
      { label: 'Earn rate', value: '2 pts per AED' },
      { label: 'Points expiry', value: '12 months' },
    ],
  },
  'camel-bean': {
    name: 'Camel Bean', tone: C.orange,
    rows: [
      { label: 'Earn rate', value: '1 pt per AED' },
      { label: 'Points expiry', value: '12 months' },
    ],
  },
};

const FALLBACK = PROGRAMMES['bloom-coffee'] as Terms;

export default function JoinConfirm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = (id ? PROGRAMMES[id] : undefined) ?? FALLBACK;

  return (
    <View style={{ flex: 1, backgroundColor: p.tone }}>
      <Pressable onPress={() => router.back()} style={{ flex: 1, backgroundColor: 'rgba(21,21,15,.45)' }} />

      <View
        style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 30, borderTopRightRadius: 30,
          paddingHorizontal: SP.gutter, paddingTop: 14, paddingBottom: 32 + insets.bottom,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: C.hairline }} />
        </View>

        <H2 style={{ marginTop: 22, fontSize: 26, lineHeight: 32, letterSpacing: -0.65 }}>Join {p.name}?</H2>
        <Body tone="muted" style={{ marginTop: 10, fontSize: 14, lineHeight: 21.7 }}>
          Your name and number are shared with the brand. You can leave any time from card settings.
        </Body>

        <View style={{ marginTop: 22 }}>
          {p.rows.map((r, i) => (
            <View
              key={r.label}
              style={{ paddingVertical: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline }}
            >
              <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{r.label}</Text>
              <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 3 }}>{r.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 26 }}>
          {/* TODO(api): POST /customer/memberships { merchantId } */}
          <Button
            label="Join"
            onPress={() => router.replace(`/join/success?id=${id ?? 'bloom-coffee'}`)}
            style={{ height: 58, borderRadius: 18, backgroundColor: p.tone }}
          />
          <Pressable onPress={() => router.back()} style={{ paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
