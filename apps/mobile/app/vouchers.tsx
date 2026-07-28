import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BackButton, Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

function VoucherRow({ colors, badge, title, expires, onPress }: { colors: [string, string]; badge: string; title: string; expires: string; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, padding: 14, ...elevation(t.elevColor) }}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font.display(800), fontSize: 16, color: '#fff' }}>{badge}</Text>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 14.5, color: t.ink }}>{title}</Text>
        <Text style={{ fontSize: 12, color: t.faint, marginTop: 2 }}>{expires}</Text>
      </View>
      <View style={{ backgroundColor: 'rgba(191,242,5,0.24)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 11, color: '#4d5c00' }}>Active</Text>
      </View>
    </Pressable>
  );
}

export default function Vouchers() {
  const t = useTokens();
  const router = useRouter();
  const tabs = [
    { label: 'Active 2', active: true },
    { label: 'Used', active: false },
    { label: 'Expired', active: false },
  ];
  return (
    <Screen pad>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <BackButton fallback="/profile" />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, color: t.ink, letterSpacing: -0.6 }}>My vouchers</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingTop: 14 }}>
        {tabs.map((tab) => (
          <View key={tab.label} style={{ backgroundColor: tab.active ? BRAND.blue : t.chip, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999 }}>
            <Text style={{ fontFamily: font.sans(tab.active ? 700 : 600), fontSize: 12.5, color: tab.active ? '#fff' : t.ink }}>{tab.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 16, gap: 12 }}>
        <VoucherRow colors={[BRAND.blue, BRAND.deep]} badge="CB" title="Free flat white" expires="Expires 30 Jul" onPress={() => router.push('/voucher/flw')} />
        <VoucherRow colors={[BRAND.purple, '#4A1E99']} badge="N" title="10% off any cake" expires="Expires 12 Aug" onPress={() => router.push('/voucher/cake')} />
      </View>
    </Screen>
  );
}
