import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BrandCard, brandColor, brandInitials } from '@/components/BrandCard';
import { ErrorState, Header, IconButton, Loading, Screen, pts } from '@/components/UI';
import { WalletsEmpty } from '@/components/WalletsEmpty';
import { getActivity, getCards, getChallenges, getProfile, getVouchers } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { Dot } from '@/components/Bits';
import { CardsSkeleton } from '@/components/CardsSkeleton';
import { ReadyRewards } from '@/components/ReadyRewards';
import { StampStrip } from '@/components/StampStrip';
import { OfflineBar } from '@/components/OfflineBar';
import { ProfileMeter } from '@/components/ProfileMeter';
import { completion } from '@/lib/completion';
import { useUnreadCount } from '@/lib/unread';
import { C, font } from '@/lib/tokens';

/** 09 · Cards (home) — the deck of brand cards. */

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <Path d="M10.5 20a1.8 1.8 0 0 0 3 0" />
    </Svg>
  );
}

/** Cards overlap so only each one's header row peeks above the next. */
const CARD_HEIGHT = 200;
const PEEK = 68;
/** How many of the deck sit on the home screen; the rest live in All cards. */
const DECK = 3;

export default function CardsHome() {
  const router = useRouter();
  const { data: cards, loading, refreshing, error, signedOut, refresh } = useAsync(getCards, []);
  // Only feeds the avatar button, so it stays out of the screen's own state:
  // an unreadable profile costs two letters, not the deck.
  const profile = useAsync(getProfile, []);
  const initials = profile.data?.fullName ? brandInitials(profile.data.fullName) : '';

  // Anything on the activity feed the customer hasn't opened the bell to see.
  // Derived from the same events the notifications screen renders, so the count
  // and the list can't disagree.
  const notices = useAsync(() => getActivity(40), []);
  // What the customer is collecting, and what they have already won — both
  // belong on the first screen rather than two taps down.
  const vouchers = useAsync(getVouchers, []);
  const stamps = useAsync(async () => {
    const list = await getCards();
    const rows = await Promise.all(
      list.map(async (card) => {
        try {
          return (await getChallenges(card.brandId))
            .filter((c) => c.isStampCard || c.rewardReady)
            .map((challenge) => ({ challenge, card }));
        } catch {
          // One brand failing must not cost the whole strip.
          return [];
        }
      }),
    );
    return rows.flat();
  }, []);
  const profileCompletion = completion(profile.data);

  // A failure with cards already in hand is the offline case: keep showing them
  // and say how old they are. A failure with nothing to show is a real error.
  const offline = Boolean(error && cards && cards.length > 0);
  const lastLoadedAt = useRef<Date | null>(null);
  if (cards && !error) lastLoadedAt.current = new Date();
  const unread = useUnreadCount((notices.data ?? []).map((e) => e.at));

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const all = cards ?? [];
  const deck = all.slice(0, DECK);
  const deckHeight = PEEK * (deck.length - 1) + CARD_HEIGHT;

  return (
    <Screen background={C.surface} refreshing={refreshing} onRefresh={refresh}>
      <Header
        title="Cards"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View>
              <IconButton onPress={() => router.push('/notifications')}>
                <BellIcon />
              </IconButton>
              {unread > 0 ? <Dot count={unread} /> : null}
            </View>
            <IconButton onPress={() => router.push('/(tabs)/profile')} style={{ borderRadius: 999 }}>
              <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.muted }}>{initials}</Text>
            </IconButton>
          </View>
        }
      />

      {/* 64 · balances stay on screen when the network doesn't. */}
      {offline ? <OfflineBar asOf={lastLoadedAt.current} /> : null}

      <ProfileMeter completion={profileCompletion} />

      {/* 69 · the deck's own shape, so nothing jumps when it arrives. */}
      {loading ? <CardsSkeleton /> : null}

      {!loading && error && !cards ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && cards && all.length === 0 ? <WalletsEmpty /> : null}

      {deck.length > 0 ? (
        <>
          <View style={{ height: deckHeight, marginTop: 8 }}>
            {deck.map((c, i) => {
              const color = brandColor(c.brandId, c.branding);
              return (
                <View key={c.membershipId} style={{ position: 'absolute', left: 0, right: 0, top: i * PEEK, zIndex: i + 1 }}>
                  <BrandCard
                    name={c.brandName}
                    initial={brandInitials(c.brandName)}
                    branding={c.branding}
                    color={color}
                    tier={c.tier ?? undefined}
                    points={Number(c.available)}
                    footnote={c.nextTier && c.toNextTier ? `${pts(Number(c.toNextTier))} to ${c.nextTier}` : undefined}
                    progress={c.nextTier ? c.progressPct / 100 : undefined}
                    onPress={() => router.push(`/wallet/${c.brandId}`)}
                  />
                </View>
              );
            })}
          </View>

          <ReadyRewards vouchers={vouchers.data ?? []} />
          <StampStrip rows={stamps.data ?? []} />

          {all.length > DECK ? (
            <Pressable
              onPress={() => router.push('/all-cards')}
              style={({ pressed }) => ({ marginTop: 28, alignSelf: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: C.muted }}>
                All {all.length} cards
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
