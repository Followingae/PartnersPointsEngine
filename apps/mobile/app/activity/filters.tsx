import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

function Chip({ label, on }: { label: string; on?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ backgroundColor: on ? BRAND.blue : t.chip, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999 }}>
      <Text style={{ fontFamily: font.sans(on ? 700 : 600), fontSize: 12.5, color: on ? '#fff' : t.ink }}>{label}</Text>
    </View>
  );
}

export default function ActivityFilters() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(38,38,38,0.32)' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 30 + insets.bottom }}>
        <View style={{ alignItems: 'center', paddingBottom: 8 }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: t.line }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: font.display(700), fontSize: 20, color: t.ink }}>Filter activity</Text>
          <Text style={{ fontFamily: font.sans(600), fontSize: 13, color: BRAND.blue }}>Reset</Text>
        </View>

        <Text style={{ marginTop: 20, fontFamily: font.sans(700), fontSize: 12, color: t.soft, textTransform: 'uppercase', letterSpacing: 0.6 }}>Type</Text>
        <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          <Chip label="Earned" on /><Chip label="Redeemed" /><Chip label="Converted" on /><Chip label="Bonus" /><Chip label="Expired" />
        </View>

        <Text style={{ marginTop: 22, fontFamily: font.sans(700), fontSize: 12, color: t.soft, textTransform: 'uppercase', letterSpacing: 0.6 }}>Merchant</Text>
        <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          <Chip label="Camel Bean" on /><Chip label="Núr" /><Chip label="Verde" />
        </View>

        <Text style={{ marginTop: 22, fontFamily: font.sans(700), fontSize: 12, color: t.soft, textTransform: 'uppercase', letterSpacing: 0.6 }}>Date range</Text>
        <View style={{ marginTop: 10, flexDirection: 'row', gap: 10 }}>
          {['1 Jun', '17 Jun'].map((d) => (
            <View key={d} style={{ flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontFamily: font.sans(600), fontSize: 13, color: t.ink }}>{d}</Text>
            </View>
          ))}
        </View>

        <Pressable onPress={() => router.back()} style={{ marginTop: 24, backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontFamily: font.sans(700), fontSize: 16 }}>Show 24 results</Text>
        </Pressable>
      </View>
    </View>
  );
}
