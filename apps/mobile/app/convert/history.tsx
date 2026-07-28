import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, EmptyState, ErrorState, H1, Loading, Screen, pts } from '@/components/UI';
import { C } from '@/lib/tokens';
import { GroupLabel, ListRow, TopBar } from '@/components/RewardKit';
import { ConversionRow, useConversions } from './_data';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "July", or "July 2025" once the year is no longer the current one. */
function monthOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const month = MONTHS[d.getMonth()];
  return d.getFullYear() === new Date().getFullYear() ? month : `${month} ${d.getFullYear()}`;
}

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};

/** Rows keep their month heading, so consecutive months group without a lookup. */
function byMonth(rows: ConversionRow[]): { month: string; rows: ConversionRow[] }[] {
  const out: { month: string; rows: ConversionRow[] }[] = [];
  for (const row of rows) {
    const month = monthOf(row.createdAt);
    const last = out[out.length - 1];
    if (last && last.month === month) last.rows.push(row);
    else out.push({ month, rows: [row] });
  }
  return out;
}

export default function TransferHistory() {
  const router = useRouter();
  const { data, loading, refreshing, error, signedOut, refresh } = useConversions();

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const groups = byMonth(data ?? []);

  return (
    <Screen background={C.surface} bottomGap={30} refreshing={refreshing} onRefresh={refresh}>
      <TopBar />

      <H1 style={{ marginTop: 20 }}>Transfers</H1>
      <Body tone="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 22 }}>
        To Lulu Happiness Points
      </Body>

      {loading ? <Loading /> : null}

      {!loading && error && !data ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && data && data.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          body="Points you move to Lulu will be listed here."
          actionLabel="Convert points"
          onAction={() => router.push('/convert')}
        />
      ) : null}

      {groups.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          {groups.map((g, gi) => (
            <View key={`${g.month}-${gi}`}>
              <GroupLabel style={gi > 0 ? { marginTop: 22 } : undefined}>{g.month}</GroupLabel>
              {g.rows.map((r, i) => {
                const failed = r.status === 'failed';
                const sub = [dayOf(r.createdAt), r.brandName, failed ? 'failed, refunded' : r.status]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <ListRow
                    key={r.id}
                    title={
                      failed
                        ? `${pts(Number(r.sourcePoints))} pts`
                        : `${pts(Number(r.sourcePoints))} pts → ${pts(Number(r.partnerPoints))} Lulu`
                    }
                    sub={sub}
                    value={failed ? 'Refunded' : undefined}
                    valueTone="faint"
                    divider={i > 0}
                  />
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
