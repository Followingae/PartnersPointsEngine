import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, ErrorState, Loading, Row, money, pts } from '@/components/UI';
import { getActivity, getCards, getProgram, type ActivityEvent } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, S, SP, font } from '@/lib/tokens';

/**
 * 29 · Pay and earn — the receipt mirror after paying partly with points.
 *
 * What is real here and what isn't, plainly:
 *
 *  · Real, from the wallet — the brand, the time, the points spent, the points
 *    earned, and the balance left. The points side of the transaction is on the
 *    activity feed like any other movement.
 *  · Real, computed — what those points came off the bill as, from the brand's
 *    own redemption rate (`GET /customer/program`).
 *  · Not available — the bill total and what went on the card. No customer-facing
 *    endpoint carries money amounts: `ActivityEvent` has none, and the e-receipt
 *    is a till-issued public link the app holds no token for. They are accepted
 *    as route params, which is where they will come from once the scanner has a
 *    settle call to make; until then those two rows read "—" rather than showing
 *    a number nobody sourced.
 *
 * Nothing in the app routes here yet — the scanner has no settle endpoint to
 * branch on — so this is reachable only with params today.
 */

/** A dashed rule — RN's dashed borders are unreliable, so draw the dashes. */
function DashedRule() {
  return (
    <View style={{ flexDirection: 'row', overflow: 'hidden', height: 1 }}>
      {Array.from({ length: 60 }, (_, i) => (
        <View key={i} style={{ width: 4, height: 1, marginRight: 3, backgroundColor: C.hairline }} />
      ))}
    </View>
  );
}

const DASH = '—';

/** "Today · 2:41 PM", with the till's reference when one was passed. */
function whenLabel(iso: string, ref?: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = d.toDateString() === new Date().toDateString()
    ? 'Today'
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  return [day, time, ref ? `#${ref}` : null].filter(Boolean).join(' · ');
}

/** A route param that should be a number, or undefined when it wasn't passed. */
function num(v: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(v) ? v[0] : v;
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

const newest = (events: ActivityEvent[], brandId: string | undefined, match: (e: ActivityEvent) => boolean) =>
  events.find((e) => match(e) && (!brandId || e.brandId === brandId));

export default function PayAndEarn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    brandId?: string; billMinor?: string; cardMinor?: string;
    pointsSpent?: string; earned?: string; ref?: string;
  }>();
  const wanted = Array.isArray(params.brandId) ? params.brandId[0] : params.brandId;

  const state = useAsync(async () => {
    const [cards, activity] = await Promise.all([getCards(), getActivity(20)]);
    const spend = newest(activity, wanted, (e) => e.type === 'redeem' && e.direction === 'debit');
    const earn = newest(activity, wanted, (e) => e.type === 'earn' && e.direction === 'credit');
    const brandId = wanted ?? earn?.brandId ?? spend?.brandId ?? cards[0]?.brandId;
    const card = cards.find((c) => c.brandId === brandId) ?? null;
    // The rate is per brand and only needed to price the points side.
    const program = brandId ? await getProgram(brandId).catch(() => null) : null;
    return { card, spend, earn, program };
  }, [wanted]);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  const { card, spend, earn, program } = state.data ?? {};

  // Points are unsigned here — the row's own label and colour carry the sign.
  const magnitude = (e?: ActivityEvent) => {
    const n = Number((e?.points ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const pointsSpent = num(params.pointsSpent) ?? magnitude(spend);
  const earned = num(params.earned) ?? magnitude(earn);
  const billMinor = num(params.billMinor);
  const cardMinor = num(params.cardMinor);

  const rate = program?.redemption;
  const ratePoints = rate?.ratePoints ? Number(rate.ratePoints) : 0;
  const rateValue = rate?.rateValueMinor ? Number(rate.rateValueMinor) : 0;
  const pointsValueMinor =
    pointsSpent !== undefined && ratePoints > 0 && rateValue > 0
      ? Math.round((pointsSpent / ratePoints) * rateValue)
      : undefined;

  const currency = card?.currency ?? program?.currency ?? 'AED';
  const at = earn?.at ?? spend?.at;
  const ref = Array.isArray(params.ref) ? params.ref[0] : params.ref;

  const spentValue = pointsSpent === undefined
    ? DASH
    : pointsValueMinor === undefined
      ? `−${pts(pointsSpent)} pts`
      : `−${pts(pointsSpent)} pts · ${money(pointsValueMinor, currency)}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: SP.gutter }}>
        {state.loading ? (
          <Loading />
        ) : state.error && !state.data ? (
          <ErrorState message={state.error} onRetry={state.refresh} />
        ) : (
          <>
            <Card style={{ borderRadius: 22, paddingHorizontal: 24, paddingVertical: 26 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }}>
                  {card?.brandName ?? 'Your purchase'}
                </Text>
                <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.soft, marginTop: 5 }}>
                  {at ? whenLabel(at, ref) : 'Awaiting the till'}
                </Text>
              </View>

              <View style={{ marginTop: 24, paddingTop: 22 }}>
                <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}><DashedRule /></View>
                <View style={{ gap: 15 }}>
                  <Row label="Bill" value={billMinor === undefined ? DASH : money(billMinor, currency)} />
                  <Row label="Paid with points" value={spentValue} valueColor={S.spend} />
                  <Row label="Paid by card" value={cardMinor === undefined ? DASH : money(cardMinor, currency)} />
                  <Row
                    label="Earned"
                    value={earned === undefined ? DASH : `+${pts(earned)} pts`}
                    valueColor={S.earnInk}
                  />
                </View>
              </View>

              <View style={{ marginTop: 22, paddingTop: 22 }}>
                <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}><DashedRule /></View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: font(500), fontSize: 14.5, lineHeight: 20, color: C.muted }}>Balance</Text>
                  <Text style={{ fontFamily: font(600), fontSize: 30, lineHeight: 35, letterSpacing: -0.9, color: C.ink }}>
                    {card ? pts(Number(card.available)) : DASH}
                  </Text>
                </View>
              </View>
            </Card>

            <Text style={{ marginTop: 20, marginHorizontal: 2, textAlign: 'center', fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.soft }}>
              {billMinor === undefined
                ? 'The points side of your purchase. The bill total stays on the till’s receipt.'
                : 'The same numbers as your printed receipt.'}
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
