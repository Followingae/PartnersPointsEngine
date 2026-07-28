import { Text, View } from 'react-native';
import { BackButton, Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

function EarnRow({ tint, emoji, title, sub, value, valueColor }: { tint: string; emoji: string; title: string; sub: string; value: string; valueColor: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, padding: 15, ...elevation(t.elevColor) }}>
      <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 14.5, color: t.ink }}>{title}</Text>
        <Text style={{ fontSize: 12.5, color: t.soft, marginTop: 2 }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: font.display(700), fontSize: 14, color: valueColor }}>{value}</Text>
    </View>
  );
}

export default function HowYouEarn() {
  const t = useTokens();
  return (
    <Screen pad>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <BackButton />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, color: t.ink, letterSpacing: -0.6 }}>How you earn</Text>
        <Text style={{ fontSize: 14, color: t.soft, marginTop: 8 }}>Every dirham counts toward points & tier.</Text>
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 12 }}>
        <EarnRow tint="rgba(191,242,5,0.22)" emoji="🛍️" title="Every purchase" sub="In-store & online · pickup orders" value="1 pt/AED" valueColor="#4d5c00" />
        <EarnRow tint="rgba(255,171,61,0.2)" emoji="⏰" title="Happy hour" sub="Thursdays · 4:00–6:00 PM" value="2×" valueColor={BRAND.blue} />
        <EarnRow tint="rgba(255,111,165,0.18)" emoji="🎂" title="Your birthday" sub="All day · the whole month" value="2×" valueColor={BRAND.blue} />
        <EarnRow tint="rgba(11,4,217,0.1)" emoji="👥" title="Refer a friend" sub="When they make a first purchase" value="+200" valueColor="#4d5c00" />
      </View>
      <Text style={{ marginHorizontal: 22, marginTop: 18, fontSize: 11.5, color: t.faint, lineHeight: 17 }}>
        Points post within 24 hours of a transaction. Multipliers apply to base points only and don't stack with each other. Points expire 12 months after the last activity.
      </Text>
    </Screen>
  );
}
