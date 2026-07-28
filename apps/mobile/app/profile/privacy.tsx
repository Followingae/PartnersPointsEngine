import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { SettingsHeader, Toggle } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

export default function Privacy() {
  const t = useTokens();
  const [personalized, setPersonalized] = useState(true);
  const [share, setShare] = useState(false);
  return (
    <Screen>
      <SettingsHeader title="Privacy & data" />
      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        <Pressable onPress={() => setPersonalized((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>Personalized offers</Text>
            <Text style={{ fontSize: 12, color: t.soft }}>Use my activity to tailor offers</Text>
          </View>
          <Toggle on={personalized} />
        </Pressable>
        <Pressable onPress={() => setShare((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>Share data with merchants</Text>
            <Text style={{ fontSize: 12, color: t.soft }}>Let merchants see your tier</Text>
          </View>
          <Toggle on={share} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 22, paddingTop: 22, gap: 12 }}>
        {/* TODO(api): GDPR export */}
        <Pressable style={[{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, padding: 15, paddingHorizontal: 16 }, elevation(t.elevColor)]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
          </Svg>
          <Text style={{ flex: 1, fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>Download my data</Text>
        </Pressable>
        {/* TODO(api): GDPR delete */}
        <Pressable style={[{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: t.card, borderWidth: 1, borderColor: 'rgba(242,98,46,0.3)', borderRadius: 16, padding: 15, paddingHorizontal: 16 }, elevation(t.elevColor)]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BRAND.coral} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
          </Svg>
          <Text style={{ flex: 1, fontFamily: font.sans(600), fontSize: 14.5, color: BRAND.coral }}>Delete my account</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
