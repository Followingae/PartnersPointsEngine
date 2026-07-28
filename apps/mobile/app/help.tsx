import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { Chevron, SettingsHeader } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

const FAQ = [
  'How does converting to Lulu work?',
  'When do my points expire?',
  'How do I move to a new phone?',
  "Why didn't I earn points?",
];

export default function Help() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen>
      <SettingsHeader title="How can we help?" />
      <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, padding: 14, paddingHorizontal: 15 }, elevation(t.elevColor)]}>
          <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="M20 20l-3.2-3.2" />
          </Svg>
          <Text style={{ flex: 1, fontSize: 14.5, color: t.faint }}>Search help articles</Text>
        </View>
      </View>

      <Text style={{ paddingHorizontal: 22, paddingTop: 18, fontFamily: font.sans(700), fontSize: 12, color: t.faint, textTransform: 'uppercase', letterSpacing: 0.8 }}>Popular</Text>
      <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
        {FAQ.map((q, i) => (
          <View key={q} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, borderBottomWidth: i === FAQ.length - 1 ? 0 : 1, borderBottomColor: t.line }}>
            <Text style={{ flex: 1, fontFamily: font.sans(600), fontSize: 14, color: t.ink }}>{q}</Text>
            <Chevron size={16} />
          </View>
        ))}
      </View>

      <Pressable onPress={() => router.push('/help/contact')} style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        <View style={{ backgroundColor: BRAND.blue, borderRadius: 16, paddingVertical: 15, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: '#fff' }}>Contact support</Text>
        </View>
      </Pressable>
    </Screen>
  );
}
