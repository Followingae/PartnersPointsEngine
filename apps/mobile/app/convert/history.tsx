import { View, Text } from 'react-native';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

const ROWS: { amt: string; status: 'Completed' | 'Reversed'; meta: string; ref: string }[] = [
  { amt: '2,800 pts → 560 LHP', status: 'Completed', meta: '17 Jun · 3 merchants', ref: 'CNV·8821·LP' },
  { amt: '1,000 pts → 200 LHP', status: 'Completed', meta: '2 Jun · Camel Bean', ref: 'CNV·7715·LP' },
  { amt: '600 pts → 120 LHP', status: 'Reversed', meta: '21 May · Verde Market', ref: 'CNV·7402·LP' },
];

export default function ConversionHistory() {
  const t = useTokens();
  return (
    <Screen>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/home" />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, letterSpacing: -0.5, color: t.ink }}>Conversions</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: t.soft, fontFamily: font.sans(400) }}>Lifetime · 1,420 Lulu Happiness Points</Text>
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 12 }}>
        {ROWS.map((r) => {
          const reversed = r.status === 'Reversed';
          return (
            <View key={r.ref} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, paddingVertical: 15, paddingHorizontal: 16, opacity: reversed ? 0.75 : 1, shadowColor: t.elevColor, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 1, shadowRadius: 22, elevation: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: font.display(700), fontSize: 15, color: t.ink }}>{r.amt}</Text>
                <Text style={{ fontFamily: font.sans(700), fontSize: 11, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: reversed ? 'rgba(242,98,46,0.16)' : 'rgba(191,242,5,0.24)', color: reversed ? BRAND.coral : '#4d5c00' }}>{r.status}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={{ fontSize: 12, color: t.faint, fontFamily: font.sans(400) }}>{r.meta}</Text>
                <Text style={{ fontSize: 12, color: t.faint, fontFamily: font.mono(400) }}>{r.ref}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
