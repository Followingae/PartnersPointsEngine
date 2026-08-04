import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/UI';
import { C, R, SP, font } from '@/lib/tokens';

/**
 * The centre modal screens 84–86 are drawn as.
 *
 * Sits over the dimmed Cards screen rather than replacing it, because the
 * customer did not ask to be here — leaving the app they opened visible
 * underneath is the difference between an interruption and a detour.
 *
 * Dismissal is deliberately easy: the ×, the backdrop, and a named secondary
 * action all close it. A prompt that is hard to escape gets answered with
 * nonsense.
 */
export function PromptSheet({
  title,
  body,
  children,
  primaryLabel,
  onPrimary,
  primaryLoading,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  onDismiss,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  secondaryLabel: string;
  onSecondary: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(21,21,15,.55)', justifyContent: 'center' }}>
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        onPress={onDismiss}
      />

      <View
        style={{
          marginHorizontal: SP.gutter,
          marginBottom: insets.bottom,
          backgroundColor: C.surface,
          borderRadius: 30,
          paddingHorizontal: 24,
          paddingTop: 22,
          paddingBottom: 24,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable onPress={onDismiss} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={2} strokeLinecap="round">
              <Path d="M6 6l12 12M18 6L6 18" />
            </Svg>
          </Pressable>
        </View>

        <Text
          style={{
            marginTop: 4,
            fontFamily: font(600),
            fontSize: 23,
            lineHeight: 29,
            letterSpacing: -0.5,
            color: C.ink,
          }}
        >
          {title}
        </Text>

        {body ? (
          <Text
            style={{
              marginTop: 10,
              fontFamily: font(500),
              fontSize: 14,
              lineHeight: 21,
              color: C.muted,
            }}
          >
            {body}
          </Text>
        ) : null}

        {children ? <View style={{ marginTop: 20 }}>{children}</View> : null}

        <Button
          label={primaryLabel}
          onPress={onPrimary}
          loading={primaryLoading}
          disabled={primaryDisabled}
          style={{ marginTop: 22, height: 56, borderRadius: R.card }}
        />

        <Pressable
          onPress={onSecondary}
          style={({ pressed }) => ({ paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.muted }}>
            {secondaryLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
