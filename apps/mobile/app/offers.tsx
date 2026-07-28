import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

type Offer = { icon: string; iconText?: string; grad: [string, string]; title: string; meta: string; clipped: boolean };
const OFFERS: Offer[] = [
  { iconText: '15', grad: [BRAND.coral, '#c94512'], icon: '', title: '15% off your next order', meta: 'Olive & Thyme · expires in 3 days', clipped: false },
  { icon: '☕', grad: [BRAND.blue, BRAND.deep], title: 'Free pastry over AED 40', meta: 'Camel Bean · expires in 6 days', clipped: true },
  { icon: '🎁', grad: [BRAND.purple, '#4A1E99'], title: 'Double points weekend', meta: 'All wallets · Fri–Sun', clipped: false },
];

export default function Offers() {
  const t = useTokens();
  return (
    <Screen>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/home" />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, letterSpacing: -0.5, color: t.ink }}>For you</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: t.soft, fontFamily: font.sans(400) }}>Personalized offers · clip to your wallet.</Text>
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 14 }}>
        {OFFERS.map((o) => (
          <View key={o.title} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: t.elevColor, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 1, shadowRadius: 22, elevation: 3 }}>
            <LinearGradient colors={o.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 54, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
              {o.iconText ? <Text style={{ fontFamily: font.display(800), fontSize: 24, color: '#fff' }}>{o.iconText}</Text> : <Text style={{ fontSize: 24 }}>{o.icon}</Text>}
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.ink }}>{o.title}</Text>
              <Text style={{ fontSize: 12, color: t.soft, fontFamily: font.sans(400) }}>{o.meta}</Text>
            </View>
            {o.clipped ? (
              <Text style={{ fontFamily: font.sans(700), fontSize: 11, backgroundColor: 'rgba(191,242,5,0.24)', color: '#4d5c00', paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999 }}>Clipped</Text>
            ) : (
              <Pressable style={{ backgroundColor: BRAND.blue, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999 }}>
                <Text style={{ fontFamily: font.sans(700), fontSize: 12.5, color: '#fff' }}>Clip</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </Screen>
  );
}
