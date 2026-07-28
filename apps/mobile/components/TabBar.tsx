import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C, font } from '@/lib/tokens';

/** Stroked line icons matching the design's set. */
function Icon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? C.ink : 'rgba(21,21,15,.45)';
  const p = {
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  switch (name) {
    case 'cards':
      return (
        <Svg width={21} height={21} viewBox="0 0 24 24">
          <Rect x={2.5} y={6} width={19} height={13} rx={3.2} {...p} />
          <Path d="M2.5 10.5h19" {...p} />
        </Svg>
      );
    case 'discover':
      return (
        <Svg width={21} height={21} viewBox="0 0 24 24">
          <Circle cx={11} cy={11} r={7.2} {...p} />
          <Path d="M16.5 16.5L21 21" {...p} />
        </Svg>
      );
    case 'activity':
      return (
        <Svg width={21} height={21} viewBox="0 0 24 24">
          <Path d="M4 6h16M7 12h10M10 18h4" {...p} />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={21} height={21} viewBox="0 0 24 24">
          <Circle cx={12} cy={8} r={3.4} {...p} />
          <Path d="M5 19.5a7 7 0 0 1 14 0" {...p} />
        </Svg>
      );
    default:
      return null;
  }
}

/** QR glyph for the raised centre button. */
function ScanGlyph() {
  const p = {
    stroke: '#fff',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Rect x={3.5} y={3.5} width={6.5} height={6.5} rx={1.6} {...p} />
      <Rect x={14} y={3.5} width={6.5} height={6.5} rx={1.6} {...p} />
      <Rect x={3.5} y={14} width={6.5} height={6.5} rx={1.6} {...p} />
      <Path d="M14 14h3v3h-3zM20.5 14v6.5H17" {...p} />
    </Svg>
  );
}

const LABELS: Record<string, string> = {
  home: 'Cards',
  discover: 'Discover',
  activity: 'Activity',
  profile: 'Profile',
};
const ICONS: Record<string, string> = {
  home: 'cards',
  discover: 'discover',
  activity: 'activity',
  profile: 'profile',
};

/** Minimal shape of what expo-router's Tabs passes to a custom tabBar. */
type TabRoute = { key: string; name: string };
type TabBarProps = {
  state: { index: number; routes: TabRoute[] };
  navigation: { navigate: (name: string) => void };
};

/** Floating bar with the raised Scan button in the middle. */
export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r: TabRoute) => r.name !== 'scan');
  const left = routes.slice(0, 2);
  const right = routes.slice(2);
  const activeName = state.routes[state.index]?.name;

  const item = (routeName: string, key: string) => (
    <Pressable
      key={key}
      onPress={() => navigation.navigate(routeName)}
      style={styles.item}
      hitSlop={8}
    >
      <Icon name={ICONS[routeName] ?? 'cards'} active={activeName === routeName} />
      <Text style={[styles.label, { color: activeName === routeName ? C.ink : 'rgba(21,21,15,.55)' }]}>
        {LABELS[routeName] ?? routeName}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {left.map((r) => item(r.name, r.key))}
        <View style={{ width: 64 }} />
        {right.map((r) => item(r.name, r.key))}
      </View>
      <Pressable
        onPress={() => navigation.navigate("scan")}
        style={[styles.scan, { bottom: Math.max(insets.bottom, 10) + 18 }]}
      >
        <ScanGlyph />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,.96)',
    borderRadius: 999,
    height: 66,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: C.hairline,
    shadowColor: '#15150F',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontFamily: font(600), fontSize: 9.5 },
  scan: {
    position: 'absolute',
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#15150F',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
