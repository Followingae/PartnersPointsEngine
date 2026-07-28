import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { brandColor, brandTint } from '@/components/BrandCard';
import { Button, Loading, Small, pts } from '@/components/UI';
import { ApiError, redeemReward } from '@/lib/api';
import { C } from '@/lib/tokens';
import { ListRow, SheetScreen, TextAction } from '@/components/RewardKit';
import { affords, cost, shortfall, useRewards } from '../_data';

/**
 * The last screen before points actually leave the account.
 *
 * Two things matter here beyond the copy: the confirm is dead until the balance
 * covers the cost, and one tap can only ever produce one redemption — the guard
 * is a ref rather than the `busy` flag because state lands a frame too late to
 * stop a double tap.
 */
export default function ConfirmRedemption() {
  const { id, brandId } = useLocalSearchParams<{ id: string; brandId?: string }>();
  const router = useRouter();
  const { data, loading, error, signedOut, refresh } = useRewards(brandId);

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /** True when the request never came back, so the outcome is not known. */
  const [unresolved, setUnresolved] = useState(false);
  const sent = useRef(false);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = data?.card;
  const reward = data?.rewards.find((r) => r.id === id);
  const color = card ? brandColor(card.brandId, card.branding) : C.orange;
  const canAfford = reward ? affords(card, reward) : false;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/rewards'));

  async function confirm() {
    if (!reward || !card || sent.current) return;
    sent.current = true;
    setBusy(true);
    setFailed(null);
    try {
      const { voucher } = await redeemReward(card.brandId, reward.id);
      router.replace({
        pathname: '/rewards/redeemed',
        params: {
          code: voucher.code,
          pointsSpent: voucher.pointsSpent,
          name: reward.name,
          brandId: card.brandId,
        },
      });
    } catch (e) {
      // The API explains itself — insufficient points, reward withdrawn, and so
      // on. Show that, keep the customer here, and let them try again.
      if (e instanceof ApiError && e.isAuth) {
        router.replace('/onboarding/phone');
        return;
      }
      // A request that never completed may still have been processed, and a
      // retry mints a fresh idempotency key rather than replaying this one — so
      // the only safe move is to stop and point at the vouchers list.
      const noAnswer = e instanceof ApiError && e.status === 0;
      setFailed(e instanceof Error ? e.message : 'Something went wrong');
      setUnresolved(noAnswer);
      if (!noAnswer) sent.current = false;
      setBusy(false);
    }
  }

  return (
    <SheetScreen backdrop={color} title="Redeem this?">
      {loading ? <Loading /> : null}

      {!loading && !reward ? (
        <View style={{ marginTop: 22 }}>
          <Small style={{ fontSize: 13.5, lineHeight: 20 }}>
            {error ?? 'This reward is no longer available.'}
          </Small>
          <View style={{ marginTop: 22 }}>
            <Button label={error ? 'Try again' : 'Back to rewards'} onPress={error ? refresh : back} />
          </View>
        </View>
      ) : null}

      {reward && card ? (
        <>
          <View style={{ marginTop: 22 }}>
            <ListRow
              icon="cup"
              iconBg={brandTint(color, 0.12)}
              iconColor={color}
              title={reward.name}
              sub={reward.description ?? card.brandName}
            />
            <ListRow title="Cost" value={`${pts(cost(reward))} pts`} divider />
            <ListRow
              title={canAfford ? 'Balance after' : 'Your balance'}
              value={`${pts(canAfford ? Number(card.available) - cost(reward) : Number(card.available))} pts`}
              divider
            />
          </View>

          {!canAfford ? (
            <Small style={{ marginTop: 16, fontSize: 13, lineHeight: 19 }}>
              You need {pts(shortfall(card, reward))} more pts at {card.brandName} before you can redeem this.
            </Small>
          ) : null}

          {failed ? (
            <Small style={{ marginTop: 16, fontSize: 13, lineHeight: 19, color: C.crimson }}>
              {failed}
              {unresolved ? ' Check your vouchers before trying again — this may have gone through.' : ''}
            </Small>
          ) : null}

          <View style={{ marginTop: 26 }}>
            {unresolved ? (
              <Button label="Check my vouchers" onPress={() => router.replace('/vouchers')} />
            ) : (
              <Button
                label={failed ? 'Try again' : 'Redeem'}
                loading={busy}
                disabled={!canAfford}
                onPress={confirm}
              />
            )}
            <TextAction label={unresolved ? 'Back to rewards' : 'Cancel'} onPress={busy ? undefined : back} />
          </View>
        </>
      ) : null}
    </SheetScreen>
  );
}
