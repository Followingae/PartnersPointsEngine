import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';
import { ErrorState, Loading, Screen } from '@/components/UI';
import { getCards, getScanCode, type Card } from '@/lib/api';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { useAsync } from '@/lib/useAsync';
import { useTillWatch } from '@/lib/useTillWatch';
import { C, font, shadow } from '@/lib/tokens';

const BOX = 252;
const QR = 196;

/**
 * 25 · My code — the screen the customer holds up at the till.
 *
 * The value is the membership's loyalty id, which the server registers as a
 * scannable identifier for that brand. It is per card, so switching cards
 * switches the code: a Camel Bean till can only recognise a Camel Bean member.
 *
 * It deliberately doesn't rotate. Rotation would require the terminal to resolve
 * a short-lived token, but terminals in the field resolve a hashed identifier —
 * a rotating code would simply fail to scan. The code identifies the customer;
 * on its own it can't spend anything.
 */
export default function MyQrTab() {
  const router = useRouter();
  // Arriving from a card's detail screen, that card's code is the one wanted.
  const { brandId } = useLocalSearchParams<{ brandId?: string }>();
  const [index, setIndex] = useState(0);

  const cards = useAsync<Card[]>(getCards, []);
  const list = cards.data ?? [];
  const card = list[Math.min(index, Math.max(list.length - 1, 0))];

  const scan = useAsync(async () => (card ? getScanCode(card.brandId) : null), [card?.brandId]);

  useEffect(() => {
    if (!brandId || !cards.data) return;
    const i = cards.data.findIndex((c) => c.brandId === brandId);
    if (i >= 0) setIndex(i);
  }, [brandId, cards.data]);

  useEffect(() => {
    if (cards.signedOut || scan.signedOut) router.replace('/onboarding/phone');
  }, [cards.signedOut, scan.signedOut, router]);

  /**
   * The till has no way to tell the phone it scanned, so while the code is on
   * screen we watch the activity feed for what it posted. Points that came off
   * the bill as well as on it is a different receipt (29) from a plain earn (27).
   */
  useTillWatch(Boolean(card), ({ earned, spent }) => {
    const brand = earned?.brandId ?? spent?.brandId ?? undefined;
    if (spent) {
      router.replace({ pathname: '/scan/pay-and-earn', params: brand ? { brandId: brand } : {} });
      return;
    }
    router.replace({
      pathname: '/scan/result',
      params: { ...(earned ? { eventId: earned.id } : {}), ...(brand ? { brandId: brand } : {}) },
    });
  });

  return (
    <Screen scroll={false} bottomGap={96} background={C.surface}>
      <View style={{ flexDirection: 'row', backgroundColor: C.canvas, borderRadius: 999, padding: 4, marginTop: 14 }}>
        <View
          style={{
            flex: 1, alignItems: 'center', paddingVertical: 10,
            backgroundColor: C.surface, borderRadius: 999,
            shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
          }}
        >
          <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>My code</Text>
        </View>
        <Pressable onPress={() => router.push('/scan/camera')} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
          <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: C.muted }}>Scan a code</Text>
        </Pressable>
      </View>

      {cards.loading ? (
        <Loading label="Loading your cards" />
      ) : cards.error ? (
        <ErrorState message={cards.error} onRetry={cards.refresh} />
      ) : !card ? (
        <ErrorState
          message="You don’t have a card yet. Join a brand to get a code you can show at the till."
          onRetry={() => router.push('/discover')}
        />
      ) : (
        <>
          {/* Tapping cycles cards — a code belongs to one brand's till. */}
          <View style={{ alignItems: 'center', marginTop: 22 }}>
            <Pressable
              onPress={() => setIndex((i) => (i + 1) % list.length)}
              disabled={list.length < 2}
              style={({ pressed }) => [
                {
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: C.canvas, borderRadius: 999,
                  paddingLeft: 10, paddingRight: 14, paddingVertical: 8,
                },
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              <View
                style={{
                  width: 26, height: 26, borderRadius: 9,
                  backgroundColor: brandColor(card.brandId, card.branding),
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: font(600), fontSize: 10, lineHeight: 14, color: brandFg(brandColor(card.brandId, card.branding)) }}>
                  {brandInitials(card.brandName)}
                </Text>
              </View>
              <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>{card.brandName}</Text>
              {list.length > 1 ? (
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M6 9l6 6 6-6" />
                </Svg>
              ) : null}
            </Pressable>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: BOX, height: BOX, borderRadius: 28, backgroundColor: C.surface,
                alignItems: 'center', justifyContent: 'center', ...shadow.card,
              }}
            >
              {scan.loading ? (
                <Loading />
              ) : scan.error || !scan.data ? (
                <ErrorState message={scan.error ?? 'No code available'} onRetry={scan.refresh} />
              ) : (
                <QRCode value={scan.data.value} size={QR} color={C.ink} backgroundColor={C.surface} ecl="M" />
              )}
            </View>

            <View style={{ width: BOX, marginTop: 26 }}>
              <Text style={{ textAlign: 'center', fontFamily: font(500), fontSize: 13, lineHeight: 18, color: C.muted }}>
                Show this at the till
              </Text>
              {scan.data ? (
                <Text
                  style={{
                    marginTop: 8, textAlign: 'center', fontFamily: font(600),
                    fontSize: 14, lineHeight: 20, color: C.soft, letterSpacing: 1.2,
                  }}
                >
                  {scan.data.loyaltyId}
                </Text>
              ) : null}
              <Text style={{ marginTop: 16, textAlign: 'center', fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.soft }}>
                Or give the cashier your mobile number
              </Text>
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}
