import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { BRAND } from '@/lib/tokens';
import { useTokens } from '@/lib/theme';

type IconProps = { color: string };

const Icons: Record<string, (p: IconProps) => React.ReactNode> = {
  home: ({ color }) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinejoin="round">
      <Path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" />
    </Svg>
  ),
  discover: ({ color }) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinejoin="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </Svg>
  ),
  activity: ({ color }) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 13h4l2-6 3.5 13 2.5-7h6" />
    </Svg>
  ),
  profile: ({ color }) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
      <Circle cx={12} cy={8} r={3.4} />
      <Path d="M5 19.5a7 7 0 0 1 14 0" />
    </Svg>
  ),
};

const LABELS: Record<string, string> = { home: 'Home', discover: 'Discover', activity: 'Activity', profile: 'Profile' };
const ORDER = ['home', 'discover', 'scan', 'activity', 'profile'];

/** Minimal shape of the props the Expo Router `tabBar` callback provides. */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    navigate: (name: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit: (e: any) => any;
  };
}

/** Floating, rounded bottom tab bar with the raised center Scan button. */
export function TabBar({ state, navigation }: TabBarProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  const go = (name: string) => {
    const event = navigation.emit({ type: 'tabPress', target: name, canPreventDefault: true });
    if (!event?.defaultPrevented) navigation.navigate(name as never);
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 14 + (insets.bottom ? insets.bottom - 6 : 0),
        height: 66,
        backgroundColor: t.barbg,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: t.line,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 22,
        shadowColor: t.elevColor,
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 1,
        shadowRadius: 22,
        elevation: 12,
      }}
    >
      {ORDER.map((name) => {
        if (name === 'scan') {
          return (
            <Pressable key="scan" onPress={() => go('scan')} hitSlop={8}>
              <LinearGradient
                colors={[BRAND.sky, BRAND.blue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: -30,
                  shadowColor: BRAND.blue,
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.6,
                  shadowRadius: 16,
                  elevation: 10,
                }}
              >
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round">
                  <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                  <Path d="M4 12h16" />
                </Svg>
              </LinearGradient>
            </Pressable>
          );
        }
        const color = activeName === name ? BRAND.blue : t.faint;
        return (
          <Pressable key={name} onPress={() => go(name)} style={{ alignItems: 'center', gap: 3 }} hitSlop={8}>
            {Icons[name]({ color })}
            <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9.5, color }}>{LABELS[name]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
