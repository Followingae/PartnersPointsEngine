import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, ErrorState, Loading, Screen, pts } from '@/components/UI';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { getCards, type Card } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, font } from '@/lib/tokens';
import { Footer, Monogram, Sub, Title } from './_components';

/**
 * 05 · Account found — the moment a returning number is recognised.
 *
 * The till has been earning this person points against their phone number for
 * however long; this is the first time they see them all in one place. So the
 * cards are their real cards with their real balances — the whole point of the
 * screen is that the numbers are already theirs.
 *
 * Only OTP routes here, and only when the wallet came back non-empty. If it is
 * empty anyway, don't show an empty celebration — carry on to the next step.
 */

/** The biggest balances lead; anything past that becomes a closing line. */
const SHOWN = 3;

function LinkedRow({ card }: { card: Card }) {
  const bg = brandColor(card.brandId, card.branding);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Monogram
        code={brandInitials(card.brandName)}
        size={44}
        radius={14}
        bg={bg}
        color={brandFg(bg)}
        fontSize={14}
      />
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.ink }}
      >
        {card.brandName}
      </Text>
      <Text style={{ fontFamily: font(600), fontSize: 20, lineHeight: 24, letterSpacing: -0.6, color: C.ink }}>
        {pts(Number(card.available))}
      </Text>
    </View>
  );
}

export default function AccountFound() {
  const router = useRouter();
  const { data: cards, loading, error, signedOut, refresh } = useAsync(getCards, []);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
    else if (cards && cards.length === 0) router.replace('/onboarding/biometric');
  }, [signedOut, cards, router]);

  const ranked = [...(cards ?? [])].sort((a, b) => Number(b.available) - Number(a.available));
  const lead = ranked.slice(0, SHOWN);
  const rest = ranked.length - lead.length;

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      {loading ? (
        <Loading />
      ) : error && !cards ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Title>We found your points</Title>
            <Sub style={{ marginTop: 10 }}>
              {ranked.length === 1
                ? 'One card is already linked to your number.'
                : `${ranked.length} cards are already linked to your number.`}
            </Sub>

            <View style={{ marginTop: 32, gap: 12 }}>
              {lead.map((card) => (
                <LinkedRow key={card.membershipId} card={card} />
              ))}
              {rest > 0 ? (
                <Sub style={{ marginTop: 4 }}>{rest === 1 ? 'And one more.' : `And ${rest} more.`}</Sub>
              ) : null}
            </View>
          </View>

          <Footer>
            <Button label="Open my cards" onPress={() => router.push('/onboarding/biometric')} />
          </Footer>
        </>
      )}
    </Screen>
  );
}
