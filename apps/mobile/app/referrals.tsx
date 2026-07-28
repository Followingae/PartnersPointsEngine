import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Share, Text, View } from 'react-native';
import { BackBar, Lede } from '@/components/Bits';
import { Button, Chip, EmptyState, ErrorState, H1, Label, Loading, Screen } from '@/components/UI';
import { getCards, getReferralCode } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, R, SP, font } from '@/lib/tokens';

export default function Referrals() {
  const router = useRouter();
  const [brandId, setBrandId] = useState<string | null>(null);

  // A referral code belongs to one brand's programme, not to the wallet.
  const cards = useAsync(getCards);
  const brands = cards.data ?? [];
  const active = brandId ?? brands[0]?.brandId ?? null;
  const activeName = brands.find((b) => b.brandId === active)?.brandName;

  const code = useAsync(
    () => (active ? getReferralCode(active) : Promise.resolve(null)),
    [active],
  );

  useEffect(() => {
    if (cards.signedOut || code.signedOut) router.replace('/onboarding/phone');
  }, [cards.signedOut, code.signedOut, router]);

  const refresh = () => {
    cards.refresh();
    code.refresh();
  };

  const value = code.data?.code ?? null;
  const loading = cards.loading || (Boolean(active) && code.loading);
  const error = cards.error ?? code.error;

  const share = () => {
    if (!value) return;
    void Share.share({
      message: `Join me at ${activeName ?? 'Partners Points'} — use my code ${value} when you sign up.`,
    });
  };

  return (
    <Screen scroll={false} bottomGap={34}>
      <BackBar fallback="/home" />

      <View style={{ flex: 1 }}>
        <H1 style={{ marginTop: 20 }}>Invite a friend</H1>
        <Lede style={{ marginTop: 10 }}>
          Share your code and you both pick up the brand’s referral bonus.
        </Lede>

        {/* One code per card, so the brand has to be chosen before there is one. */}
        {brands.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.tight, marginTop: 22 }}>
            {brands.map((b) => (
              <Pressable key={b.brandId} onPress={() => setBrandId(b.brandId)}>
                <Chip
                  label={b.brandName}
                  tone={b.brandId === active ? 'ink' : 'neutral'}
                  style={{ paddingHorizontal: 15, paddingVertical: 9 }}
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading ? (
          <Loading />
        ) : error && !value ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !active ? (
          <EmptyState
            title="No cards yet"
            body="Join a brand to get a referral code you can share."
            actionLabel="Find a brand"
            onAction={() => router.push('/discover')}
          />
        ) : !value ? (
          <EmptyState
            title="No code yet"
            body={`${activeName ?? 'This brand'} isn’t running a referral programme right now.`}
          />
        ) : (
          <View style={{ marginTop: 28, padding: 24, borderRadius: 22, backgroundColor: C.wash, alignItems: 'center' }}>
            <Label style={{ fontSize: 11.5, lineHeight: 16, color: C.muted }}>
              {activeName ? `Your ${activeName} code` : 'Your code'}
            </Label>
            <Text style={{ marginTop: 12, fontFamily: font(600), fontSize: 30, lineHeight: 35, letterSpacing: 4.2, color: C.ink }}>
              {value}
            </Text>
          </View>
        )}
      </View>

      <Button
        label="Share my code"
        onPress={share}
        disabled={!value}
        style={{ borderRadius: R.card, height: 58 }}
      />
    </Screen>
  );
}
