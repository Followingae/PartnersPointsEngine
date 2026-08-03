import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button, EmptyState, ErrorState, H1, Label, Loading, Progress, Screen, Small, pts,
} from '@/components/UI';
import { C, R, font } from '@/lib/tokens';
import { Footer, Ic, ListRow, TopBar } from '@/components/RewardKit';
import { blockedReason, partnerCurrency, partnerPointsFor, rateLabel, stepFor, useConvert } from './_data';

function StepButton({ icon, onPress, disabled }: { icon: 'minus' | 'plus'; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          width: 52, height: 52, borderRadius: R.chip, backgroundColor: C.canvas,
          alignItems: 'center', justifyContent: 'center',
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ic name={icon} size={20} sw={2.2} />
    </Pressable>
  );
}

/**
 * Pick how many points to move.
 *
 * Conversion is per brand — the partner deal, the rate and the minimum all
 * belong to one merchant — so the points come out of one card and the customer
 * chooses which. The figure under "You receive" is the server's own rate applied
 * locally so the stepper stays instant; `review` re-previews before anything
 * moves, and that quote is the one that is confirmed.
 */
export default function Convert() {
  const router = useRouter();
  const params = useLocalSearchParams<{ brandId?: string }>();
  const [brandId, setBrandId] = useState<string | undefined>(params.brandId);
  const [picking, setPicking] = useState(false);
  const { data, loading, error, signedOut, refresh } = useConvert(brandId);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = data?.card;
  const cards = data?.cards ?? [];
  const preview = data?.preview;
  const terms = data?.terms;

  const available = Number(card?.available ?? 0);
  // The merchant's minimum sets the step, so every stop on the picker is a valid
  // transfer rather than one the server will reject.
  const step = stepFor(terms);
  const maxAmount = Math.floor(available / step) * step;

  // Start at the smallest valid transfer whenever the terms change: this is a
  // real spend, so the picker should never open pre-loaded with a large one.
  const [amount, setAmount] = useState(step);
  useEffect(() => {
    setAmount(step);
  }, [step, card?.brandId]);

  const blocked = blockedReason(preview);
  const linked = terms?.linked === true;
  const tooPoor = !!preview && !blocked && maxAmount < step;
  const partnerOut = partnerPointsFor(amount, terms?.ratioBps);

  const clamp = (next: number) => setAmount(Math.max(step, Math.min(maxAmount, next)));

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar />

      <H1 style={{ marginTop: 20 }}>Convert points</H1>

      {loading ? <Loading /> : null}

      {!loading && error && !data ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && data && !card ? (
        <EmptyState
          title="No cards yet"
          body="Join a brand and you can convert its points."
          actionLabel="Browse brands"
          onAction={() => router.push('/discover')}
        />
      ) : null}

      {card ? (
        <>
          {/* Destination account */}
          <Pressable
            onPress={linked ? undefined : () => router.push({ pathname: '/convert/link', params: { brandId: card.brandId } })}
            style={({ pressed }) => [
              {
                marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 14,
                paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18, backgroundColor: C.canvas,
              },
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <View style={{
              width: 42, height: 42, borderRadius: 13, backgroundColor: C.surface,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Image source={require('@/assets/lulu-icon.png')} style={{ width: 30, height: 30, resizeMode: 'contain' }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>
                {partnerCurrency(terms)}
              </Text>
              <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>
                {linked ? 'Linked' : 'Tap to link your account'}
              </Small>
            </View>
            {linked
              ? <Ic name="check" size={18} color={C.greenDeep} sw={2.2} />
              : <Ic name="right" size={17} color={C.soft} sw={2} />}
          </Pressable>

          {/* Which card the points come out of. */}
          {picking && cards.length > 1 ? (
            <View style={{ marginTop: 10 }}>
              {cards.map((c, i) => (
                <ListRow
                  key={c.membershipId}
                  title={c.brandName}
                  sub={c.brandId === card.brandId ? 'Converting from this card' : undefined}
                  value={`${pts(Number(c.available))} pts`}
                  divider={i > 0}
                  onPress={() => {
                    setBrandId(c.brandId);
                    setPicking(false);
                  }}
                />
              ))}
            </View>
          ) : null}

          {!picking ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Pressable
                onPress={cards.length > 1 ? () => setPicking(true) : undefined}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 7 },
                  pressed ? { opacity: 0.6 } : null,
                ]}
              >
                <Label style={{ fontSize: 12, lineHeight: 17, letterSpacing: 1.2 }}>
                  Available at {card.brandName}
                </Label>
                {cards.length > 1 ? <Ic name="swap" size={13} color={C.soft} sw={2.2} /> : null}
              </Pressable>
              <Text style={{ marginTop: 14, fontFamily: font(600), fontSize: 60, lineHeight: 70, letterSpacing: -2.4, color: C.ink }}>
                {pts(available)}
              </Text>

              {blocked ? (
                <Small style={{ marginTop: 22, fontSize: 13.5, lineHeight: 20, textAlign: 'center' }}>{blocked}</Small>
              ) : tooPoor ? (
                <Small style={{ marginTop: 22, fontSize: 13.5, lineHeight: 20, textAlign: 'center' }}>
                  You need at least {pts(step)} pts at {card.brandName} to convert.
                </Small>
              ) : (
                <>
                  <View style={{ marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                    <StepButton icon="minus" onPress={() => clamp(amount - step)} disabled={amount <= step} />
                    <Text style={{
                      minWidth: 120, textAlign: 'center',
                      fontFamily: font(600), fontSize: 30, lineHeight: 35, letterSpacing: -0.9, color: C.ink,
                    }}>
                      {pts(amount)}
                    </Text>
                    <StepButton icon="plus" onPress={() => clamp(amount + step)} disabled={amount >= maxAmount} />
                  </View>

                  <View style={{ marginTop: 18, width: 220 }}>
                    <Progress value={amount} total={maxAmount} />
                  </View>

                  <View style={{
                    marginTop: 30, alignSelf: 'stretch', paddingVertical: 18, paddingHorizontal: 22,
                    borderRadius: 20, backgroundColor: C.canvas, alignItems: 'center',
                  }}>
                    <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted }}>You receive</Text>
                    <Text style={{ marginTop: 8, fontFamily: font(600), fontSize: 34, lineHeight: 39, letterSpacing: -1, color: C.ink }}>
                      {pts(partnerOut)}
                    </Text>
                    <Small style={{ marginTop: 6, fontSize: 12.5, lineHeight: 18 }}>
                      {partnerCurrency(terms)} · {rateLabel(terms?.ratioBps)}
                    </Small>
                  </View>
                </>
              )}
            </View>
          ) : null}

          {!picking ? (
            <Footer>
              {blocked || tooPoor ? (
                <Button label="Back" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))} />
              ) : linked ? (
                <Button
                  label="Convert"
                  disabled={partnerOut <= 0}
                  onPress={() =>
                    router.push({
                      pathname: '/convert/review',
                      params: { brandId: card.brandId, amount: String(amount) },
                    })
                  }
                />
              ) : (
                <Button
                  label="Link your account"
                  onPress={() => router.push({ pathname: '/convert/link', params: { brandId: card.brandId } })}
                />
              )}
            </Footer>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
