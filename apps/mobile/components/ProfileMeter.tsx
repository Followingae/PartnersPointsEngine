import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Progress, Small } from '@/components/UI';
import type { Completion } from '@/lib/completion';
import { C, R, font } from '@/lib/tokens';

/**
 * 78 · Cards — profile nudge, and 88 · Snoozed state.
 *
 * The same component for both, because they are the same thing seen at
 * different volumes: a quiet meter that is always on Cards and never counts as
 * an interruption. When every popup has been dismissed into retirement this is
 * what remains, and it is the reason retiring them is acceptable at all.
 *
 * Disappears once the profile is complete — a finished meter is furniture.
 */
export function ProfileMeter({ completion }: { completion: Completion }) {
  const router = useRouter();
  if (completion.complete) return null;

  return (
    <Pressable
      onPress={() => router.push('/profile/completion')}
      style={({ pressed }) => [
        {
          marginTop: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: C.canvas,
          borderRadius: R.tile,
          paddingHorizontal: 16,
          paddingVertical: 14,
        },
        pressed ? { opacity: 0.75 } : null,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font(600), fontSize: 13.5, lineHeight: 19, color: C.ink }}>
          {`Profile ${completion.done} of ${completion.total}`}
        </Text>
        <View style={{ marginTop: 8 }}>
          <Progress value={completion.done} total={completion.total} height={4} />
        </View>
      </View>
      <Small style={{ fontSize: 12.5, lineHeight: 18 }}>Finish</Small>
    </Pressable>
  );
}
