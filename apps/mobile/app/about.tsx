import { Image } from 'react-native';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Screen, BackButton } from '@/components/Screen';
import { useTheme, useTokens } from '@/lib/theme';
import { font } from '@/lib/tokens';

function Chevron({ t }: { t: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t} strokeWidth={2.4} strokeLinecap="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export default function About() {
  const t = useTokens();
  const { theme } = useTheme();
  const wordmark = theme === 'light' ? require('@/assets/pp-wordmark-dark.png') : require('@/assets/pp-wordmark-light.png');
  const legal = ['Terms of service', 'Privacy policy', 'Licenses'];

  return (
    <Screen scroll={false}>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/profile" />
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 }}>
        <Image source={wordmark} style={{ width: 200, height: 48, resizeMode: 'contain' }} />
        <Text style={{ marginTop: 16, fontFamily: font.mono(500), fontSize: 13, color: t.soft }}>Version 1.0.0 (build 142)</Text>
      </View>

      <View style={{ paddingHorizontal: 22 }}>
        {legal.map((l, i) => (
          <View
            key={l}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 16,
              borderTopWidth: 1,
              borderTopColor: t.line,
              borderBottomWidth: i === legal.length - 1 ? 1 : 0,
              borderBottomColor: t.line,
            }}
          >
            <Text style={{ flex: 1, fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>{l}</Text>
            <Chevron t={t.faint} />
          </View>
        ))}
      </View>
      <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: t.faint }}>Made in the UAE · © 2026 Partners Points</Text>
    </Screen>
  );
}
