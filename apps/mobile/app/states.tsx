import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { SettingsHeader } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

function Spinner() {
  const t = useTokens();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 4, borderColor: t.line, borderTopColor: BRAND.blue, transform: [{ rotate }] }} />;
}

function Frame({ caption, children, bg }: { caption: string; children: ReactNode; bg?: string }) {
  const t = useTokens();
  return (
    <View style={{ marginBottom: 26 }}>
      <Text style={{ fontFamily: font.mono(600), fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: t.faint, marginBottom: 10, marginLeft: 4 }}>{caption}</Text>
      <View style={[{ height: 460, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: t.line, backgroundColor: bg ?? t.canvas }, elevation(t.elevColor)]}>{children}</View>
    </View>
  );
}

const CTA = ({ label, bg = BRAND.blue, color = '#fff' }: { label: string; bg?: string; color?: string }) => (
  <View style={{ backgroundColor: bg, borderRadius: 18, paddingVertical: 16, alignItems: 'center', width: '100%' }}>
    <Text style={{ fontFamily: font.sans(700), fontSize: 16, color }}>{label}</Text>
  </View>
);

export default function States() {
  const t = useTokens();
  return (
    <Screen>
      <SettingsHeader title="System states" />
      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        {/* LOADING */}
        <Frame caption="Loading skeleton">
          <View style={{ flex: 1, padding: 22 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ width: 120, height: 22, borderRadius: 7, backgroundColor: t.chip }} />
              <View style={{ width: 42, height: 42, borderRadius: 999, backgroundColor: t.chip }} />
            </View>
            <View style={{ height: 46, borderRadius: 14, backgroundColor: t.chip, marginTop: 22 }} />
            <View style={{ width: 140, height: 20, borderRadius: 6, backgroundColor: t.chip, marginTop: 18 }} />
            <View style={{ height: 130, borderRadius: 28, backgroundColor: t.chip, marginTop: 14 }} />
            <View style={{ height: 130, borderRadius: 28, backgroundColor: t.chip, marginTop: 14, opacity: 0.7 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Spinner />
            </View>
          </View>
        </Frame>

        {/* OFFLINE */}
        <Frame caption="Offline / error">
          <View style={{ flex: 1 }}>
            <View style={{ backgroundColor: 'rgba(242,98,46,0.14)', paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 12.5, color: BRAND.coral }}>⚠ You&apos;re offline · showing cached balances</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
              <View style={{ width: 104, height: 104, borderRadius: 30, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M5 12.5a7 7 0 0 1 14 0M8.5 15.5a3.5 3.5 0 0 1 7 0M12 19v.5M2 2l20 20" />
                </Svg>
              </View>
              <Text style={{ marginTop: 24, fontFamily: font.display(700), fontSize: 26, letterSpacing: -0.5, color: t.ink }}>No connection</Text>
              <Text style={{ marginTop: 12, fontSize: 15, color: t.soft, textAlign: 'center' }}>We&apos;ll refresh your points the moment you&apos;re back online.</Text>
            </View>
            <View style={{ padding: 26, paddingBottom: 28 }}>
              <CTA label="Try again" />
            </View>
          </View>
        </Frame>

        {/* PERMISSION */}
        <Frame caption="Permission denied" bg="#161a1f">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
            <View style={{ width: 96, height: 96, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M5 7h3l1-2h6l1 2h3v12H5z" />
                <Path d="M3 3l18 18" />
              </Svg>
            </View>
            <Text style={{ marginTop: 26, fontFamily: font.display(700), fontSize: 26, letterSpacing: -0.5, color: '#fff', textAlign: 'center' }}>Camera access needed</Text>
            <Text style={{ marginTop: 12, fontSize: 15, color: 'rgba(255,255,255,0.72)', textAlign: 'center' }}>Allow camera access to scan codes. You can change this in Settings.</Text>
            <View style={{ marginTop: 30, width: '100%' }}>
              <CTA label="Open Settings" bg="#fff" color={BRAND.blue} />
            </View>
            <Text style={{ marginTop: 14, fontFamily: font.sans(600), fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Enter code manually</Text>
          </View>
        </Frame>

        {/* MAINTENANCE */}
        <Frame caption="Maintenance">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
            <LinearGradient colors={[BRAND.blue, BRAND.purple]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 120, height: 120, borderRadius: 30, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 54 }}>🛠️</Text>
            </LinearGradient>
            <Text style={{ marginTop: 28, fontFamily: font.display(700), fontSize: 27, letterSpacing: -0.5, color: t.ink, textAlign: 'center' }}>Back in a bit</Text>
            <Text style={{ marginTop: 12, fontSize: 15, color: t.soft, textAlign: 'center' }}>We&apos;re making Partners Points better. Your points are safe — check back shortly.</Text>
            <Text style={{ marginTop: 24, fontFamily: font.mono(500), fontSize: 13, color: t.faint }}>Est. back · 14:30 GST</Text>
          </View>
        </Frame>

        {/* FORCE UPDATE */}
        <Frame caption="Force update">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
            <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 104, height: 104, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 20V8M7 13l5-5 5 5M5 4h14" />
              </Svg>
            </LinearGradient>
            <Text style={{ marginTop: 26, fontFamily: font.display(700), fontSize: 26, letterSpacing: -0.5, color: t.ink, textAlign: 'center' }}>Time to update</Text>
            <Text style={{ marginTop: 12, fontSize: 15, color: t.soft, textAlign: 'center' }}>A new version of Partners Points is ready with faster conversions and fixes.</Text>
            <View style={{ marginTop: 30, width: '100%' }}>
              <CTA label="Update now" />
            </View>
          </View>
        </Frame>
      </View>
    </Screen>
  );
}
