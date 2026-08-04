import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { brandColor, brandScrim } from '@/components/BrandCard';
import { SheetShell } from '@/components/SheetShell';
import {Body, Button, ErrorState, H2, Loading, Small, pts} from '@/components/UI';
import { getCards, getExpiring } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, SP, font } from '@/lib/tokens';

/**
 * 16 · Expiring points — a sheet over the dimmed card detail.
 *
 * `GET /customer/expiring` groups by month because that is the honest grain: a
 * month's points come from several earns on several days, so the date shown is
 * the first of them to lapse, not the only one.
 */

function ExpiryRow({ amount, when, left, urgent, first }: {
  amount: string; when: string; left: string; urgent?: boolean; first?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
        borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{amount}</Text>
        <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{when}</Small>
      </View>
      <Text style={{ fontFamily: font(urgent ? 600 : 500), fontSize: 13, lineHeight: 18, color: urgent ? C.amber : C.muted }}>
        {left}
      </Text>
    </View>
  );
}

/** "12 Aug 2026" from the endpoint's `YYYY-MM-DD`, read as a plain calendar day. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

const daysLabel = (n: number) => (n === 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`);

export default function ExpiringPoints() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brandId = Array.isArray(id) ? id[0]! : id!;
  const router = useRouter();

  const state = useAsync(async () => {
    const [cards, expiring] = await Promise.all([getCards(), getExpiring(brandId)]);
    return { card: cards.find((c) => c.brandId === brandId) ?? null, expiring };
  }, [brandId]);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  const { card, expiring } = state.data ?? {};
  const backdrop = brandScrim(card ? brandColor(card.brandId, card.branding) : C.ink);
  const code = card?.pointsCode ?? 'pts';
  const total = expiring ? Number(expiring.total) : 0;
  const buckets = expiring?.buckets ?? [];

  return (
    <SheetShell backdrop={backdrop} onDismiss={() => router.back()}>
        {state.loading ? (
          <>
            <H2 style={{ marginTop: 22, fontSize: 26, lineHeight: 32, letterSpacing: -0.65 }}>Expiring points</H2>
            <Loading />
          </>
        ) : state.error || !expiring ? (
          <>
            <H2 style={{ marginTop: 22, fontSize: 26, lineHeight: 32, letterSpacing: -0.65 }}>Expiring points</H2>
            <ErrorState message={state.error ?? 'Could not load this'} onRetry={state.refresh} />
          </>
        ) : total === 0 ? (
          <>
            <H2 style={{ marginTop: 22, fontSize: 26, lineHeight: 32, letterSpacing: -0.65 }}>Nothing expiring</H2>
            <Body tone="muted" style={{ marginTop: 10, fontSize: 14, lineHeight: 20 }}>
              None of your {code} at {card?.brandName ?? 'this brand'} are close to lapsing. Points
              last 12 months from the day they land.
            </Body>
          </>
        ) : (
          <>
            <H2 style={{ marginTop: 22, fontSize: 26, lineHeight: 32, letterSpacing: -0.65 }}>
              {pts(total)} {code} expiring
            </H2>
            <Body tone="muted" style={{ marginTop: 10, fontSize: 14, lineHeight: 20 }}>
              Points last 12 months from the day they land.
            </Body>

            <View style={{ marginTop: 22 }}>
              {buckets.map((b, i) => (
                <ExpiryRow
                  key={b.month}
                  first={i === 0}
                  urgent={b.daysLeft <= 30}
                  amount={`${pts(Number(b.points))} ${code}`}
                  when={`Expire from ${dayLabel(b.from)}`}
                  left={daysLabel(b.daysLeft)}
                />
              ))}
            </View>
          </>
        )}

        <Button
          label={total > 0 ? `See rewards under ${pts(total)} ${code}` : 'See rewards'}
          onPress={() => router.push({ pathname: '/rewards', params: { brandId } })}
          style={{ marginTop: 26, height: 58, borderRadius: 18 }}
        />
      </SheetShell>
  );
}
