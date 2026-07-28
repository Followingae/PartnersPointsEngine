import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import Svg, { Path } from 'react-native-svg';

type Row = {
  id: string;
  title: string;
  meta: string;
  amount: string;
  amountColor: string;
  badge: { initials?: string; grad?: [string, string]; emoji?: string; bg?: string; convert?: boolean };
};

const TODAY: Row[] = [
  { id: 'txn-cb', title: 'Earned · Camel Bean', meta: '9:12 AM · JLT branch', amount: '+120', amountColor: '#4d5c00', badge: { initials: 'CB', grad: [BRAND.blue, BRAND.deep] } },
  { id: 'txn-conv', title: 'Converted to Lulu', meta: '8:40 AM · 3 merchants', amount: '−2,800', amountColor: BRAND.blue, badge: { grad: [BRAND.sky, BRAND.blue], convert: true } },
];
const YESTERDAY: Row[] = [
  { id: 'txn-nur', title: 'Redeemed · 10% off cake', meta: 'Núr Pâtisserie', amount: '−500', amountColor: BRAND.coral, badge: { initials: 'N', grad: [BRAND.purple, '#4A1E99'] } },
  { id: 'txn-bonus', title: 'Bonus · Happy hour 2×', meta: 'Camel Bean', amount: '+80', amountColor: '#4d5c00', badge: { emoji: '🎉', bg: 'rgba(191,242,5,0.22)' } },
  { id: 'txn-exp', title: 'Expired points', meta: 'Verde Market', amount: '−40', amountColor: 'faint', badge: { emoji: '⌛', bg: 'chip' } },
];

function ActivityRow({ row, last }: { row: Row; last: boolean }) {
  const t = useTokens();
  const router = useRouter();
  const amountColor = row.amountColor === 'faint' ? t.faint : row.amountColor;
  return (
    <Pressable onPress={() => router.push(`/activity/${row.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderColor: t.line }}>
      {row.badge.grad ? (
        <LinearGradient colors={row.badge.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
          {row.badge.convert ? (
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M17 4v6h-6M7 20v-6h6" /></Svg>
          ) : (
            <Text style={{ fontFamily: font.display(800), fontSize: 14, color: '#fff' }}>{row.badge.initials}</Text>
          )}
        </LinearGradient>
      ) : (
        <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: row.badge.bg === 'chip' ? t.chip : row.badge.bg }}>
          <Text style={{ fontSize: 17 }}>{row.badge.emoji}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.ink }}>{row.title}</Text>
        <Text style={{ fontSize: 12, color: t.faint, fontFamily: font.sans(400) }}>{row.meta}</Text>
      </View>
      <Text style={{ fontFamily: font.sans(700), fontSize: 14, color: amountColor }}>{row.amount}</Text>
    </Pressable>
  );
}

export default function ActivityTab() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen pad>
      <View style={{ paddingHorizontal: 22, paddingTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, letterSpacing: -0.5, color: t.ink }}>Activity</Text>
        <Pressable onPress={() => router.push('/activity/filters')} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center', shadowColor: t.elevColor, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 1, shadowRadius: 20, elevation: 3 }} hitSlop={6}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={2} strokeLinecap="round"><Path d="M4 6h16M7 12h10M10 18h4" /></Svg>
        </Pressable>
      </View>

      <Text style={{ paddingHorizontal: 22, paddingTop: 16, fontFamily: font.sans(700), fontSize: 12, color: t.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Today</Text>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        {TODAY.map((r, i) => <ActivityRow key={r.id} row={r} last={i === TODAY.length - 1} />)}
      </View>

      <Text style={{ paddingHorizontal: 22, paddingTop: 16, fontFamily: font.sans(700), fontSize: 12, color: t.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Yesterday</Text>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        {YESTERDAY.map((r, i) => <ActivityRow key={r.id} row={r} last={i === YESTERDAY.length - 1} />)}
      </View>
    </Screen>
  );
}
