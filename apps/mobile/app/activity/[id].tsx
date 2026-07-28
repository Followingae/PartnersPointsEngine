import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

const DETAILS: [string, string, boolean][] = [
  ['Date & time', '17 Jun · 9:12 AM', false],
  ['Branch', 'JLT · Cluster Y', false],
  ['Terminal', 'POS-04', true],
  ['Reference', 'TXN·5582·CB', true],
];

export default function Receipt() {
  const t = useTokens();
  return (
    <Screen>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/activity" />
      </View>
      <View style={{ paddingHorizontal: 24, paddingTop: 8, alignItems: 'center' }}>
        <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.display(800), fontSize: 22, color: '#fff' }}>CB</Text>
        </LinearGradient>
        <Text style={{ marginTop: 14, fontFamily: font.display(700), fontSize: 56, lineHeight: 50, letterSpacing: -1.1, color: '#4d5c00' }}>+120</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: t.soft, fontFamily: font.sans(400) }}>Points earned at Camel Bean</Text>
      </View>
      <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
        {DETAILS.map(([k, v, mono]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderColor: t.line }}>
            <Text style={{ fontSize: 13.5, color: t.soft, fontFamily: font.sans(400) }}>{k}</Text>
            <Text style={{ fontFamily: mono ? font.mono(500) : font.sans(600), fontSize: 13.5, color: t.ink }}>{v}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13 }}>
          <Text style={{ fontSize: 13.5, color: t.soft, fontFamily: font.sans(400) }}>Status</Text>
          <Text style={{ fontFamily: font.sans(700), fontSize: 12, backgroundColor: 'rgba(191,242,5,0.24)', color: '#4d5c00', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 }}>Posted</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 30, flexDirection: 'row', gap: 11 }}>
        {['Share', 'Report a problem'].map((label) => (
          <View key={label} style={{ flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, paddingVertical: 14, alignItems: 'center', shadowColor: t.elevColor, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 1, shadowRadius: 20, elevation: 3 }}>
            <Text style={{ fontFamily: font.sans(700), fontSize: 14, color: t.ink }}>{label}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
