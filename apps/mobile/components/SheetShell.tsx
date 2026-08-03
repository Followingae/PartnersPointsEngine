import { type ReactNode } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, SP } from '@/lib/tokens';

/**
 * A white sheet anchored to the bottom of a dimmed backdrop.
 *
 * Two things it has to get right, both of which the per-screen copies had wrong:
 *
 * · It reaches the physical bottom of the display. The home indicator's inset
 *   belongs *inside* the sheet as padding, not under it as a gap — applied
 *   outside, it lifted the whole sheet clear of the bottom edge and left a band
 *   of backdrop showing beneath it.
 * · It scrolls. A brand with a long list of earn rules, or a year of expiring
 *   buckets, is otherwise a sheet taller than the phone with its last rows off
 *   the screen and no way to reach them.
 */

/** How much of the display a sheet may take before its content starts scrolling. */
const MAX_HEIGHT = 0.86;

export function SheetShell({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={{ flex: 1 }} onPress={onDismiss} />
      <View
        style={{
          maxHeight: height * MAX_HEIGHT,
          backgroundColor: C.surface,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          paddingTop: 14,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: 'rgba(21,21,15,.08)' }} />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          // Short content shouldn't be stretched to the cap; it sizes to fit.
          contentContainerStyle={{
            paddingHorizontal: SP.gutter,
            paddingBottom: 32 + insets.bottom,
          }}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}
