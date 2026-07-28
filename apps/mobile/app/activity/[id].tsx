import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share, Text, View } from 'react-native';
import { BackBar, Icon, RoundButton, TextAction } from '@/components/Bits';
import { Card, EmptyState, ErrorState, Label, Loading, Row, Screen, Small } from '@/components/UI';
import { C, S, font } from '@/lib/tokens';
import { getActivity, type ActivityEvent } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { dateTimeLabel } from '@/lib/dates';

/**
 * 51 · Transaction detail — the receipt behind an activity row.
 *
 * There is no per-event endpoint: the feed is a merge of ledger rows and
 * voucher timestamps, assembled server-side, so an event only exists inside a
 * page of it. This screen therefore fetches a deep page and finds its row.
 */
const LOOKBACK = 200;

const amountColor = (e: ActivityEvent) =>
  e.direction === 'credit' ? S.earnInk : e.direction === 'debit' ? S.spend : C.ink;

/** The id is internal ("j:<uuid>") — support reads the short form off a screenshot. */
const reference = (id: string) => `#${id.replace(/^[jv]:/, '').slice(0, 8).toUpperCase()}`;

export default function Transaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error, signedOut, refresh } = useAsync(() => getActivity(LOOKBACK), []);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const e = data?.find((x) => x.id === id);

  const share = () => {
    if (!e) return;
    const parts = [e.title, e.brandName, dateTimeLabel(e.at), e.points, reference(e.id)];
    Share.share({ message: parts.filter(Boolean).join(' · ') });
  };

  const lines: { label: string; value: string }[] = [];
  if (e?.brandName) lines.push({ label: 'Card', value: e.brandName });
  if (e?.rewardName) lines.push({ label: 'Reward', value: e.rewardName });
  if (e?.voucherCode) lines.push({ label: 'Voucher', value: e.voucherCode });

  return (
    <Screen scroll={false} bottomGap={34}>
      <BackBar
        fallback="/activity"
        right={
          e ? (
            <RoundButton onPress={share}>
              <Icon name="share" size={18} weight={1.9} />
            </RoundButton>
          ) : undefined
        }
      />

      <View style={{ flex: 1, justifyContent: 'center' }}>
        {loading ? <Loading /> : null}

        {!loading && error ? <ErrorState message={error} onRetry={refresh} /> : null}

        {!loading && !error && !e ? (
          <EmptyState
            title="We couldn’t find this"
            body="It may have dropped off your recent activity."
            actionLabel="Back to activity"
            onAction={() => router.replace('/activity')}
          />
        ) : null}

        {!loading && !error && e ? (
          <Card style={{ borderRadius: 22, paddingVertical: 26, paddingHorizontal: 24 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink, textAlign: 'center' }}>
                {e.title}
              </Text>
              <Small style={{ marginTop: 5, fontSize: 12.5, lineHeight: 18 }}>
                {`${dateTimeLabel(e.at)} · ${reference(e.id)}`}
              </Small>
            </View>

            {/* No points moved on a reward being used — show nothing rather than a zero. */}
            {e.points ? (
              <View style={{ marginTop: 26, alignItems: 'center' }}>
                <Text style={{ fontFamily: font(600), fontSize: 48, lineHeight: 56, letterSpacing: -1.9, color: amountColor(e) }}>
                  {e.points}
                </Text>
                <Label style={{ marginTop: 6, fontSize: 12, lineHeight: 17, letterSpacing: 1.2 }}>
                  {e.direction === 'credit' ? 'points in' : 'points out'}
                </Label>
              </View>
            ) : e.voucherCode ? (
              <View style={{ marginTop: 26, alignItems: 'center' }}>
                <Text style={{ fontFamily: font(600), fontSize: 26, lineHeight: 34, letterSpacing: 2.2, color: C.ink }}>
                  {e.voucherCode}
                </Text>
                <Label style={{ marginTop: 6, fontSize: 12, lineHeight: 17, letterSpacing: 1.2 }}>voucher</Label>
              </View>
            ) : null}

            {lines.length ? (
              <View
                style={{
                  marginTop: 26,
                  paddingTop: 22,
                  borderTopWidth: 1,
                  borderStyle: 'dashed',
                  borderTopColor: C.hairline,
                  gap: 15,
                }}
              >
                {lines.map((l) => (
                  <Row key={l.label} label={l.label} value={l.value} />
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}
      </View>

      <TextAction label="Something wrong? Contact support" onPress={() => router.push('/help/contact')} />
    </Screen>
  );
}
