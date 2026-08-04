import { type ReactNode } from 'react';
import { Pressable, ScrollView, StatusBar, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, SP } from '@/lib/tokens';

/**
 * A sheet anchored to the bottom of a dimmed backdrop.
 *
 * Owns the whole screen rather than sitting inside one.
 *
 * It used to be a child of `Screen`, and twice I fixed a gap under it by
 * reasoning about that chain — the safe-area inset, the content padding, the
 * keyboard view — and twice the gap came back. So the chain is gone: this
 * positions itself absolutely against the window, and nothing above it can add
 * padding that lifts it off the bottom edge, because there is nothing above it.
 *
 * The home indicator's inset lives *inside* the sheet as padding, which is the
 * distinction that matters: the white surface reaches the physical bottom of
 * the display, and only the content is held clear of the indicator.
 */

/** How much of the display a sheet may take before its content starts scrolling. */
const MAX_HEIGHT = 0.86;

export function SheetShell({
  children,
  onDismiss,
  backdrop = 'rgba(21,21,15,.55)',
}: {
  children: ReactNode;
  onDismiss: () => void;
  /** The dimmed card behind the sheet — usually the brand's own colour. */
  backdrop?: string;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <View style={{ flex: 1, backgroundColor: backdrop }}>
      <StatusBar barStyle="light-content" />

      {/* Tapping anywhere off the sheet closes it. */}
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        onPress={onDismiss}
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
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
          // Short content sizes to fit; long content scrolls inside the cap.
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
