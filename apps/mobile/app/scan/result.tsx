import { useEffect } from 'react';
import { Dimensions, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { Button, EmptyState, ErrorState, Loading, pts } from '@/components/UI';
import { getActivity, getCards, type ActivityEvent, type Card } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, SP, font, shadow } from '@/lib/tokens';

/**
 * 27 · Points landed — the confirmation after a successful earn.
 *
 * The earn itself happens at the till, not in the app: the cashier scans the
 * customer's code and the terminal posts it. So this screen doesn't create
 * anything — it reads back the event that just landed, from the same activity
 * feed the rest of the app uses, and shows the card's live balance underneath.
 *
 * `eventId` and `brandId` are accepted so a caller that already knows which earn
 * it is can say so; without them the newest credit in the feed is the one that
 * just happened.
 *
 * The design's footnote reads "Camel Bean · JLT · AED 42.00". Neither the branch
 * nor the bill is on a wallet activity event — no customer-facing endpoint
 * carries them — so it reads brand and time instead of inventing a receipt.
 */

const H = Dimensions.get('window').height;
const CONFETTI_TONES = [C.orange, C.purple, C.green, C.blue, C.pink, C.lime];
const PIECES = Array.from({ length: 14 }, (_, i) => ({
  left: 5 + i * 6.43,
  height: [8, 11, 14][i % 3] as number,
  tone: CONFETTI_TONES[i % CONFETTI_TONES.length] as string,
  duration: 2000 + (i % 5) * 300,
  delay: (i % 7) * 180,
}));

function Piece({ left, height, tone, duration, delay }: (typeof PIECES)[number]) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, [v, duration, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -20 + v.value * (H + 40) }, { rotate: `${v.value * 540}deg` }],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: `${left}%`, width: 8, height, borderRadius: 2, backgroundColor: tone },
        style,
      ]}
    />
  );
}

/** "Today · 2:41 PM" for today, "12 Jul · 8:40 AM" before that. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Today · ${time}`;
  return `${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} · ${time}`;
}

/** The earn this screen is about: the one named, else the newest credit. */
function pickEarn(events: ActivityEvent[], eventId?: string, brandId?: string): ActivityEvent | undefined {
  if (eventId) return events.find((e) => e.id === eventId);
  return events.find(
    (e) => e.direction === 'credit' && e.type === 'earn' && (!brandId || e.brandId === brandId),
  );
}

export default function ScanResult() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId, brandId } = useLocalSearchParams<{ eventId?: string; brandId?: string }>();

  const state = useAsync(async () => {
    const [cards, activity] = await Promise.all([getCards(), getActivity(20)]);
    const event = pickEarn(activity, eventId, brandId);
    const card = cards.find((c) => c.brandId === event?.brandId) ?? null;
    return { event, card };
  }, [eventId, brandId]);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  const event = state.data?.event;
  const card: Card | null = state.data?.card ?? null;
  const color = card ? brandColor(card.brandId, card.branding) : C.orange;
  const fg = card ? brandFg(color) : C.ink;
  const chrome = fg === '#fff' ? 'rgba(255,255,255,.18)' : 'rgba(21,21,15,.15)';
  const track = fg === '#fff' ? 'rgba(255,255,255,.26)' : 'rgba(21,21,15,.22)';

  const landed = Boolean(event);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      {/* Only celebrate something that actually happened. */}
      {landed ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          {PIECES.map((p, i) => <Piece key={i} {...p} />)}
        </View>
      ) : null}

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.gutter }}>
        {state.loading ? (
          <Loading label="Looking for your points" />
        ) : state.error && !state.data ? (
          <ErrorState message={state.error} onRetry={state.refresh} />
        ) : !event ? (
          <EmptyState
            title="No points yet"
            body="The till posts points a moment after it scans your code. Check again, or look in your activity."
            actionLabel="Check again"
            onAction={state.refresh}
          />
        ) : (
          <>
            <Text style={{ fontFamily: font(600), fontSize: 72, lineHeight: 80, letterSpacing: -3.6, color: C.ink }}>
              {event.points ?? ''}
            </Text>
            <Text style={{ marginTop: 10, fontFamily: font(500), fontSize: 13, lineHeight: 18, letterSpacing: 1.3, textTransform: 'uppercase', color: C.soft }}>
              {card?.pointsCode ?? 'points'}
            </Text>

            {card ? (
              <View
                style={{
                  marginTop: 38, width: '100%', height: 200, borderRadius: 26, padding: 24,
                  backgroundColor: color, justifyContent: 'space-between', ...shadow.raised,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: chrome, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: fg }}>
                        {brandInitials(card.brandName)}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={{ flex: 1, fontFamily: font(600), fontSize: 17, lineHeight: 24, letterSpacing: -0.17, color: fg }}>
                      {card.brandName}
                    </Text>
                  </View>
                  {card.tier ? (
                    <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: fg }}>{card.tier}</Text>
                  ) : null}
                </View>

                <View style={{ gap: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ fontFamily: font(600), fontSize: 48, lineHeight: 55, letterSpacing: -1.44, color: fg }}>
                      {pts(Number(card.available))}
                    </Text>
                    <Text style={{ fontFamily: font(500), fontSize: 14, lineHeight: 20, color: fg }}>pts</Text>
                  </View>
                  {/* No tier ladder means no "to next" line and no empty bar. */}
                  {card.nextTier && card.toNextTier ? (
                    <View style={{ gap: 9 }}>
                      <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: fg }}>
                        {pts(Number(card.toNextTier))} to {card.nextTier}
                      </Text>
                      <View style={{ height: 3, borderRadius: 2, backgroundColor: track }}>
                        <View style={{ height: 3, width: `${Math.max(0, Math.min(100, card.progressPct))}%`, borderRadius: 2, backgroundColor: '#fff' }} />
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            <Text style={{ marginTop: 24, fontFamily: font(500), fontSize: 14, lineHeight: 20, color: C.muted }}>
              {[event.brandName, whenLabel(event.at)].filter(Boolean).join(' · ')}
            </Text>
          </>
        )}
      </View>

      <View style={{ paddingHorizontal: SP.gutter, paddingBottom: 34 + insets.bottom }}>
        <Button label="Done" onPress={() => router.replace('/home')} style={{ height: 58, borderRadius: 18 }} />
      </View>
    </View>
  );
}
