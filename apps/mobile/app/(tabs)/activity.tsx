import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Amount, Icon, ListRow, Tile } from '@/components/Bits';
import { Ic } from '@/components/RewardKit';
import { EmptyState, ErrorState, H1, IconButton, Label, Loading, Screen } from '@/components/UI';
import { C, R, S } from '@/lib/tokens';
import { getActivity, type ActivityEvent } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { dayLabel, timeLabel } from '@/lib/dates';
import { brandColor } from '@/components/BrandCard';
import {
  applyFilters, brandOptionsFrom, clearFilters, hasFilters, isVoucherEvent, publishBrands,
  useActivityFilters,
} from '@/app/activity/_filters';

/** Colour follows the direction the points moved, not the event's name. */
const amountColor = (e: ActivityEvent) =>
  e.direction === 'credit' ? S.earnInk : e.direction === 'debit' ? S.spend : C.ink;

/** Consecutive runs of the same day, in the order the API returned them. */
function groupByDay(events: ActivityEvent[]): { group: string; items: ActivityEvent[] }[] {
  const out: { group: string; items: ActivityEvent[] }[] = [];
  for (const e of events) {
    const group = dayLabel(e.at);
    const last = out[out.length - 1];
    if (last && last.group === group) last.items.push(e);
    else out.push({ group, items: [e] });
  }
  return out;
}

export default function Activity() {
  const router = useRouter();
  const filters = useActivityFilters();
  const { data, loading, refreshing, error, signedOut, refresh } = useAsync(() => getActivity(), []);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  // The sheet can only offer cards the feed actually mentions.
  useEffect(() => {
    publishBrands(brandOptionsFrom(data ?? []));
  }, [data]);

  const groups = groupByDay(applyFilters(data ?? [], filters));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1>Activity</H1>
        <IconButton onPress={() => router.push('/activity/filters')}>
          <Icon name="filter" size={18} />
        </IconButton>
      </View>

      {loading ? <Loading /> : null}

      {!loading && error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && !error && groups.length === 0 ? (
        hasFilters(filters) ? (
          <EmptyState
            title="Nothing matches"
            body="No recent activity fits these filters."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        ) : (
          <EmptyState
            title="No activity yet"
            body="Points you earn and rewards you use will show up here."
          />
        )
      ) : null}

      {groups.map((g, gi) => (
        <View key={g.group} style={{ marginTop: gi === 0 ? 24 : 22 }}>
          <Label>{g.group}</Label>
          {g.items.map((e, i) => {
            const reward = isVoucherEvent(e);
            return (
              <ListRow
                key={e.id}
                divider={i > 0}
                onPress={() => router.push(`/activity/${encodeURIComponent(e.id)}`)}
                lead={
                  <Tile
                    size={40}
                    radius={R.small}
                    background={reward || !e.brandId ? C.wash : brandColor(e.brandId)}
                  >
                    {reward ? <Ic name="gift" size={19} color={C.ink} sw={1.6} /> : null}
                  </Tile>
                }
                title={e.title}
                sub={[e.brandName, timeLabel(e.at)].filter(Boolean).join(' · ')}
                trailing={e.points ? <Amount value={e.points} color={amountColor(e)} /> : undefined}
              />
            );
          })}
        </View>
      ))}
    </Screen>
  );
}
