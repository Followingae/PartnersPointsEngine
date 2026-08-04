import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/UI';
import { C, R, SP, font } from '@/lib/tokens';

/**
 * The shape screens 63–68 share: a mark, a sentence, and the way out.
 *
 * They are the moments the app has nothing to show — signed out, offline, a
 * permission refused, the server down, the build too old. Each is one screen in
 * the design and they are identical but for the words, so they are one
 * component here. Writing five near-copies is how five screens drift apart.
 *
 * Every one of them has a primary action, because a dead end with no way
 * forward is the worst version of each of these.
 */
export function StateScreen({
  icon,
  title,
  body,
  primaryLabel,
  onPrimary,
  primaryLoading,
  secondaryLabel,
  onSecondary,
  tint = C.wash,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** The disc behind the mark — pink for a refusal, wash for the rest. */
  tint?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 999,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>

        <Text
          style={{
            marginTop: 30,
            fontFamily: font(600),
            fontSize: 26,
            lineHeight: 32,
            letterSpacing: -0.6,
            color: C.ink,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>

        {body ? (
          <Text
            style={{
              marginTop: 12,
              fontFamily: font(500),
              fontSize: 14.5,
              lineHeight: 22,
              color: C.muted,
              textAlign: 'center',
            }}
          >
            {body}
          </Text>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button
          label={primaryLabel}
          onPress={onPrimary}
          loading={primaryLoading}
          style={{ height: 58, borderRadius: R.card }}
        />
        {secondaryLabel && onSecondary ? (
          <Pressable
            onPress={onSecondary}
            style={({ pressed }) => ({ paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted }}>
              {secondaryLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
