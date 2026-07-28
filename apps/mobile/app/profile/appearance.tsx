import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SettingsHeader, Toggle } from '@/app/profile/_ui';
import { useTheme, useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

type Pref = 'light' | 'dark' | 'system';

function Preview({ kind }: { kind: Pref }) {
  // mini phone mock per theme
  if (kind === 'system') {
    return (
      <View style={{ aspectRatio: 9 / 16, borderRadius: 18, overflow: 'hidden' }}>
        <LinearGradient colors={['#F2F2F2', '#F2F2F2', '#0f0f13', '#0f0f13']} locations={[0, 0.5, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }} style={{ flex: 1 }} />
      </View>
    );
  }
  const light = kind === 'light';
  return (
    <View style={{ aspectRatio: 9 / 16, borderRadius: 18, overflow: 'hidden', backgroundColor: light ? '#F2F2F2' : '#0f0f13', padding: 10 }}>
      <View style={{ height: 16, borderRadius: 5, width: '60%', backgroundColor: light ? BRAND.blue : BRAND.sky }} />
      <View style={{ height: 34, borderRadius: 8, marginTop: 8, backgroundColor: light ? '#fff' : '#1b1b21' }} />
      <View style={{ height: 34, borderRadius: 8, marginTop: 6, backgroundColor: light ? '#fff' : '#1b1b21' }} />
    </View>
  );
}

export default function Appearance() {
  const t = useTokens();
  const { pref, setPref } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const options: Pref[] = ['light', 'dark', 'system'];
  const labels: Record<Pref, string> = { light: 'Light', dark: 'Dark', system: 'System' };

  return (
    <Screen>
      <SettingsHeader title="Appearance" />
      <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
        <Text style={{ fontSize: 14, color: t.soft }}>Pick how Partners Points looks.</Text>
      </View>

      <View style={{ paddingHorizontal: 22, paddingTop: 22, flexDirection: 'row', gap: 13 }}>
        {options.map((o) => {
          const on = pref === o;
          return (
            <Pressable key={o} onPress={() => setPref(o)} style={{ flex: 1 }}>
              <View
                style={{
                  borderRadius: 18,
                  borderWidth: on ? 3 : 1,
                  borderColor: on ? BRAND.blue : t.line,
                  overflow: 'hidden',
                  shadowColor: t.elevColor,
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 1,
                  shadowRadius: 18,
                  elevation: 4,
                }}
              >
                <Preview kind={o} />
              </View>
              <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: font.sans(on ? 700 : 600), fontSize: 13, color: on ? t.ink : t.soft }}>{labels[o]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={() => setReduceMotion((v) => !v)} style={{ paddingHorizontal: 22, paddingTop: 24, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>Reduce motion</Text>
          <Text style={{ fontSize: 12, color: t.soft }}>Minimise animations</Text>
        </View>
        <Toggle on={reduceMotion} />
      </Pressable>
    </Screen>
  );
}
