import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { SettingsHeader } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

export default function Contact() {
  const t = useTokens();
  const items = [
    {
      tile: 'rgba(11,4,217,0.1)',
      icon: (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </Svg>
      ),
      title: 'Live chat',
      sub: 'Typical reply in a few minutes',
    },
    {
      tile: 'rgba(27,120,242,0.14)',
      icon: (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={BRAND.sky} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={3} y={5} width={18} height={14} rx={2} />
          <Path d="M3 7l9 6 9-6" />
        </Svg>
      ),
      title: 'Email support',
      sub: 'help@partnerspoints.com',
    },
    {
      tile: 'rgba(242,98,46,0.14)',
      icon: (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={BRAND.coral} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M10.3 3.3l-7 12A2 2 0 0 0 5 18h14a2 2 0 0 0 1.7-2.7l-7-12a2 2 0 0 0-3.4 0z" />
          <Path d="M12 9v4M12 16v.5" />
        </Svg>
      ),
      title: 'Report a problem',
      sub: 'Attach a recent transaction',
    },
  ];
  return (
    <Screen>
      <SettingsHeader title="Contact us" />
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 12 }}>
        {items.map((it) => (
          // TODO(api): open chat / mail / report flow
          <View key={it.title} style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, padding: 16 }, elevation(t.elevColor)]}>
            <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: it.tile, alignItems: 'center', justifyContent: 'center' }}>{it.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.ink }}>{it.title}</Text>
              <Text style={{ fontSize: 12.5, color: t.soft }}>{it.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
