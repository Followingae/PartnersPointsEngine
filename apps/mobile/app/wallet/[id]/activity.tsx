import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  Body, EmptyState, ErrorState, H1, IconButton, Label, Loading, Screen, Small,
} from '@/components/UI';
import { getActivity, getCards, type ActivityEvent } from '@/lib/api';
import { dateTimeLabel } from '@/lib/dates';
import { useAsync } from '@/lib/useAsync';
import { C, S, font } from '@/lib/tokens';

/** 17 · Brand activity — every entry for one card. */

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

/** Today / This week / older, which is how people look for a transaction. */
function groupOf(iso: string): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return 'Earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at >= startOfToday) return 'Today';
  if (at >= startOfToday - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}

const ORDER = ['Today', 'This week', 'Earlier'];

/** Credit reads as earned, debit as spent; an event with no points is neither. */
function toneOf(e: ActivityEvent): string {
  if (e.type.startsWith('voucher_')) return C.electric;
  if (!e.direction) return C.muted;
  return e.direction === 'credit' ? S.earnInk : S.spend;
}

export default function BrandActivity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brandId = Array.isArray(id) ? id[0]! : id!;

  const state = useAsync(async () => {
    const [cards, events] = await Promise.all([getCards(), getActivity(120)]);
    return {
      card: cards.find((c) => c.brandId === brandId) ?? null,
      // The wallet feed spans brands; this screen is about one card.
      events: events.filter((e) => e.brandId === brandId),
    };
  }, [brandId]);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  const events = state.data?.events ?? [];
  const groups = ORDER.map((label) => ({
    label,
    entries: events.filter((e) => groupOf(e.at) === label),
  })).filter((g) => g.entries.length > 0);

  return (
    <Screen background={C.surface} bottomGap={40} refreshing={state.refreshing} onRefresh={state.refresh}>
      <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
      </View>

      <View style={{ marginTop: 20 }}>
        <H1 style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>
          {state.data?.card?.brandName ?? 'Activity'}
        </H1>
        <Body tone="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 20 }}>All activity</Body>
      </View>

      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={state.refresh} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Points you earn and rewards you use at this brand will show up here."
        />
      ) : (
        <View style={{ marginTop: 24 }}>
          {groups.map((group, gi) => (
            <View key={group.label}>
              <Label style={gi === 0 ? undefined : { marginTop: 22 }}>{group.label}</Label>
              {group.entries.map((e, i) => (
                <View
                  key={e.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>
                      {e.title}
                    </Text>
                    <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{dateTimeLabel(e.at)}</Small>
                  </View>
                  {/* An event that moves no points shows none, rather than a misleading 0. */}
                  {e.points ? (
                    <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: toneOf(e) }}>
                      {e.points}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
