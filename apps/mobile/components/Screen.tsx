import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useTokens } from '@/lib/theme';

/**
 * Outer container for a screen. Fills the device with the canvas colour, applies
 * the top safe-area inset, and (by default) scrolls with a hidden scrollbar.
 * `pad` adds clearance for the floating tab bar on the 5 main tabs.
 */
export function Screen({
  children,
  scroll = true,
  pad = false,
  topInset = true,
  background,
}: {
  children: ReactNode;
  scroll?: boolean;
  pad?: boolean;
  topInset?: boolean;
  background?: string;
}) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const bg = background ?? t.canvas;
  const padTop = topInset ? insets.top : 0;
  const padBottom = pad ? 110 + insets.bottom : insets.bottom;

  if (!scroll) {
    return <View style={[styles.fill, { backgroundColor: bg, paddingTop: padTop, paddingBottom: padBottom }]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: bg }]}
      contentContainerStyle={{ paddingTop: padTop, paddingBottom: padBottom }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

/** Circular back button (the design's top-left chevron-in-a-pill). */
export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const t = useTokens();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        backgroundColor: t.card,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: t.elevColor,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 4,
      }}
      hitSlop={8}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
    </Pressable>
  );
}
