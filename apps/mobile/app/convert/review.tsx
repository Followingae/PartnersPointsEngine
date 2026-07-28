import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Loading, Small, pts } from '@/components/UI';
import { C } from '@/lib/tokens';
import { ListRow, SheetScreen, TextAction } from '@/components/RewardKit';
import { blockedReason, partnerCurrency, rateLabel, useQuote } from './_data';

/**
 * Last stop before the points leave.
 *
 * Every figure on this screen comes from a fresh preview of this exact amount —
 * nothing is carried over from the picker — so what is confirmed is what the
 * server has just quoted.
 */
export default function ConvertReview() {
  const router = useRouter();
  const { brandId, amount } = useLocalSearchParams<{ brandId?: string; amount?: string }>();
  const points = Math.max(1, Number(amount ?? 0) || 0);

  const { data, loading, error, signedOut, refresh } = useQuote(brandId, points);
  const [going, setGoing] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = data?.card;
  const preview = data?.preview;
  const partnerOut = Number(preview?.partnerPoints ?? 0);

  const blocked = blockedReason(preview);
  const problem = blocked
    ?? (preview?.linked === false ? 'Link your partner account before converting.' : null)
    ?? (card && Number(card.available) < points ? 'You no longer have enough points for this transfer.' : null)
    ?? (preview && partnerOut <= 0 ? 'That amount is too small to convert.' : null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/convert'));

  /** The transfer itself is fired once, on the processing screen. */
  function confirm() {
    if (!card || started.current) return;
    started.current = true;
    setGoing(true);
    router.replace({
      pathname: '/convert/processing',
      params: { brandId: card.brandId, amount: String(points) },
    });
  }

  return (
    <SheetScreen backdrop={C.electric} title="Confirm transfer">
      {loading ? <Loading /> : null}

      {!loading && !preview ? (
        <View style={{ marginTop: 22 }}>
          <Small style={{ fontSize: 13.5, lineHeight: 20 }}>{error ?? 'Could not price this transfer.'}</Small>
          <View style={{ marginTop: 22 }}>
            <Button label="Try again" onPress={refresh} />
            <TextAction label="Back" onPress={back} />
          </View>
        </View>
      ) : null}

      {preview && card ? (
        <>
          <View style={{ marginTop: 22 }}>
            <ListRow
              title="From"
              sub={`${card.brandName} · ${pts(Number(card.available))} pts available`}
              value={`${pts(points)} pts`}
            />
            <ListRow title="Rate" sub="Quoted just now" value={rateLabel(preview.ratioBps)} divider />
            <ListRow title={partnerCurrency(preview)} sub="Credited on confirm" value={pts(partnerOut)} divider />
          </View>

          <Small tone="faint" style={{ marginTop: 18, fontSize: 12.5, lineHeight: 19 }}>
            Transfers are final. {partnerCurrency(preview)} cannot be converted back.
          </Small>

          {problem ? (
            <Small style={{ marginTop: 14, fontSize: 13, lineHeight: 19, color: C.crimson }}>{problem}</Small>
          ) : null}

          <View style={{ marginTop: 22 }}>
            <Button label="Confirm" loading={going} disabled={!!problem} onPress={confirm} />
            <TextAction label="Back" onPress={going ? undefined : back} />
          </View>
        </>
      ) : null}
    </SheetScreen>
  );
}
