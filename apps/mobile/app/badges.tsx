import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { Screen, BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import Svg, { Path, Rect } from 'react-native-svg';

const EARNED: { id: string; emoji: string; name: string; grad: [string, string] }[] = [
  { id: 'early-bird', emoji: '🌅', name: 'Early Bird', grad: [BRAND.blue, BRAND.deep] },
  { id: 'converter', emoji: '🔁', name: 'Converter', grad: [BRAND.sky, BRAND.blue] },
  { id: 'regular', emoji: '☕', name: 'Regular', grad: [BRAND.purple, '#4A1E99'] },
  { id: 'birthday', emoji: '🎂', name: 'Birthday', grad: [BRAND.lime, '#9ac400'] },
];
const LOCKED = ['Big Spender', 'Explorer'];

export default function Badges() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/home" />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, letterSpacing: -0.5, color: t.ink }}>Badges</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: t.soft, fontFamily: font.sans(400) }}>8 of 16 earned</Text>
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {EARNED.map((b) => (
          <Pressable key={b.id} onPress={() => router.push(`/badges/${b.id}`)} style={{ width: '30%' }}>
            <LinearGradient colors={b.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ aspectRatio: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: t.elevColor, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 1, shadowRadius: 22, elevation: 4 }}>
              <Text style={{ fontSize: 30 }}>{b.emoji}</Text>
            </LinearGradient>
            <Text style={{ fontFamily: font.sans(600), fontSize: 11, marginTop: 7, textAlign: 'center', color: t.ink }}>{b.name}</Text>
          </Pressable>
        ))}
        {LOCKED.map((name) => (
          <View key={name} style={{ width: '30%', opacity: 0.5 }}>
            <View style={{ aspectRatio: 1, borderRadius: 20, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2} strokeLinecap="round"><Rect x={5} y={11} width={14} height={9} rx={2} /><Path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
            </View>
            <Text style={{ fontFamily: font.sans(600), fontSize: 11, marginTop: 7, textAlign: 'center', color: t.faint }}>{name}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
