import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { BackButton, Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

function TierCard({ dot, name, threshold, perks, dim }: { dot: string; name: string; threshold: string; perks: string; dim?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, padding: 15, opacity: dim ? 0.7 : 1, ...elevation(t.elevColor) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: dot }} />
          <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.ink }}>{name}</Text>
        </View>
        <Text style={{ fontFamily: font.mono(600), fontSize: 12, color: t.faint }}>{threshold}</Text>
      </View>
      <Text style={{ fontSize: 12.5, color: t.soft, marginTop: 8 }}>{perks}</Text>
    </View>
  );
}

export default function Tiers() {
  const t = useTokens();
  return (
    <Screen pad>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <BackButton />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, color: t.ink, letterSpacing: -0.6 }}>Tiers & benefits</Text>
        <Text style={{ fontSize: 14, color: t.soft, marginTop: 8 }}>Camel Bean · you're 320 pts from Black</Text>
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 12 }}>
        <TierCard dot="#3BB0A8" name="Green" threshold="0+" perks="Welcome rewards · birthday treat" dim />
        <TierCard dot="#9aa0a6" name="Silver" threshold="1,000+" perks="+ free size upgrades · early offers" dim />
        {/* Gold — current */}
        <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 16, shadowColor: BRAND.blue, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 16 }}>🏅</Text>
              <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>Gold</Text>
              <View style={{ backgroundColor: BRAND.lime, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                <Text style={{ fontFamily: font.sans(700), fontSize: 9.5, color: '#262626' }}>YOU</Text>
              </View>
            </View>
            <Text style={{ fontFamily: font.mono(600), fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>2,000+</Text>
          </View>
          <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.9)', marginTop: 8 }}>+ 2× happy hour · monthly free drink · priority</Text>
        </LinearGradient>
        <TierCard dot="#262626" name="Black" threshold="2,800+" perks="+ exclusive blends · guest passes · concierge" />
      </View>
    </Screen>
  );
}
