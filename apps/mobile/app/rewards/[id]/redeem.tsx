import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 13.5, color: t.soft }}>{label}</Text>
      <Text style={{ fontFamily: font.sans(700), fontSize: 13.5, color: color ?? t.ink }}>{value}</Text>
    </View>
  );
}

export default function RedeemConfirm() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen scroll={false} topInset={false} background="rgba(38,38,38,0.32)">
      {/* tap backdrop to dismiss */}
      <Pressable style={{ flex: 1 }} onPress={() => (router.canGoBack() ? router.back() : router.replace('/rewards'))} />
      {/* bottom sheet */}
      <View style={{ backgroundColor: t.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 30 + insets.bottom }}>
        <View style={{ alignItems: 'center', paddingBottom: 14 }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: t.line }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#e3e3e6' }} />
          <View>
            <Text style={{ fontFamily: font.display(700), fontSize: 18, color: t.ink }}>Free flat white</Text>
            <Text style={{ fontSize: 13, color: t.soft }}>Camel Bean</Text>
          </View>
        </View>
        <View style={{ marginTop: 20, backgroundColor: t.chip, borderRadius: 16, padding: 14, gap: 10 }}>
          <Row label="Reward cost" value="450 pts" />
          <Row label="Balance now" value="2,480 pts" />
          <View style={{ height: 1, backgroundColor: t.line }} />
          <Row label="Balance after" value="2,030 pts" color={BRAND.blue} />
        </View>
        <Pressable
          onPress={() => router.replace(`/voucher/${id}`)}
          style={{ marginTop: 18, backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17, alignItems: 'center', shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 6 }}
        >
          {/* TODO(api): redeem reward → issue voucher */}
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>Confirm redemption</Text>
        </Pressable>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/rewards'))} style={{ alignItems: 'center', marginTop: 14 }}>
          <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.soft }}>Cancel</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
