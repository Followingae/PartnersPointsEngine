import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import Svg, { Path, Rect } from 'react-native-svg';

export default function Referrals() {
  const t = useTokens();
  return (
    <Screen>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/home" />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 10 }}>
        <LinearGradient colors={[BRAND.purple, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, paddingVertical: 24, paddingHorizontal: 22, alignItems: 'center', shadowColor: t.elevColor, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 1, shadowRadius: 24, elevation: 6 }}>
          <Text style={{ fontSize: 40 }}>🎁</Text>
          <Text style={{ marginTop: 12, fontFamily: font.display(700), fontSize: 26, lineHeight: 29, letterSpacing: -0.5, color: '#fff', textAlign: 'center' }}>Give 200, get 200</Text>
          <Text style={{ marginTop: 10, fontSize: 13.5, color: '#fff', opacity: 0.88, textAlign: 'center', fontFamily: font.sans(400) }}>When a friend joins &amp; earns their first points.</Text>
        </LinearGradient>

        <Text style={{ marginTop: 18, fontFamily: font.sans(700), fontSize: 12, color: t.soft, textTransform: 'uppercase', letterSpacing: 0.6 }}>Your code</Text>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, borderWidth: 2, borderColor: t.line, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 18 }}>
          <Text style={{ flex: 1, fontFamily: font.mono(600), fontSize: 22, letterSpacing: 2, color: t.ink }}>MAYA200</Text>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={9} y={9} width={11} height={11} rx={2} /><Path d="M5 15V5a2 2 0 0 1 2-2h10" /></Svg>
        </View>

        <View style={{ marginTop: 16, flexDirection: 'row', gap: 12 }}>
          {[['6', 'Invited', t.ink], ['4', 'Qualified', '#4d5c00']].map(([n, label, color]) => (
            <View key={label} style={{ flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, paddingVertical: 16, alignItems: 'center', shadowColor: t.elevColor, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 1, shadowRadius: 20, elevation: 3 }}>
              <Text style={{ fontFamily: font.display(700), fontSize: 26, color }}>{n}</Text>
              <Text style={{ fontSize: 12, color: t.soft, fontFamily: font.sans(400) }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 30 }}>
        <View style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontFamily: font.sans(700), fontSize: 16 }}>Share invite link</Text>
        </View>
      </View>
    </Screen>
  );
}
