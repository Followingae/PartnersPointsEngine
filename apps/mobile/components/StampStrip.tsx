import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Stamps } from '@/components/Bits';
import { brandColor } from '@/components/BrandCard';
import { Chip, Small } from '@/components/UI';
import type { Card, Challenge } from '@/lib/api';
import { C, R, font } from '@/lib/tokens';

/**
 * 09 · the stamp strip on Cards.
 *
 * A stamp card is the thing a customer is actually collecting, and it was
 * reachable only two taps deep — the deck showed a balance and said nothing
 * about the coffee they are three visits from. It belongs on the first screen.
 *
 * A filled card jumps to the top and says so, because a reward sitting
 * unclaimed is the most useful thing this screen can tell anybody.
 */
export function StampStrip({
  rows,
}: {
  rows: Array<{ challenge: Challenge; card: Card }>;
}) {
  const router = useRouter();
  if (rows.length === 0) return null;

  // Ready first, then closest to finishing.
  const ordered = [...rows].sort((a, b) => {
    if (a.challenge.rewardReady !== b.challenge.rewardReady) return a.challenge.rewardReady ? -1 : 1;
    const left = (c: Challenge) => Number(c.target) - Number(c.progress);
    return left(a.challenge) - left(b.challenge);
  });

  return (
    <View style={{ marginTop: 28, gap: 14 }}>
      {ordered.slice(0, 3).map(({ challenge: c, card }) => {
        const done = Number(c.progress);
        const total = Math.max(Number(c.target), 1);
        const ready = c.rewardReady;

        return (
          <Pressable
            key={`${card.brandId}:${c.id}`}
            onPress={() => router.push(`/challenges/${c.id}?brandId=${card.brandId}`)}
            style={({ pressed }) => [
              {
                backgroundColor: ready ? C.lime : C.canvas,
                borderRadius: R.tile,
                paddingHorizontal: 16,
                paddingVertical: 15,
              },
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontFamily: font(600), fontSize: 13.5, lineHeight: 19, color: C.ink }}
              >
                {`${card.brandName} · ${c.name.toLowerCase()}`}
              </Text>
              {ready ? (
                <Chip label="Ready" tone="ink" style={{ paddingHorizontal: 12, paddingVertical: 6 }} />
              ) : (
                <Small style={{ fontSize: 12.5, lineHeight: 18 }}>{`${done} of ${total}`}</Small>
              )}
            </View>

            <View style={{ marginTop: 12 }}>
              <Stamps
                done={ready ? total : done}
                total={total}
                color={ready ? C.ink : brandColor(card.brandId, card.branding)}
              />
            </View>

            {ready ? (
              <Small style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18, color: C.ink }}>
                {c.rewardVoucherCode
                  ? `${c.rewardName ?? 'Your reward'} · show ${c.rewardVoucherCode}`
                  : `${c.rewardName ?? 'Your reward'} is waiting`}
              </Small>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
