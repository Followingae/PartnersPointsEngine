import { useEffect } from 'react';
import { Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, H1, Screen, Small } from '@/components/UI';
import { C } from '@/lib/tokens';
import { CenterState, Disc, Footer, TextAction } from '@/components/RewardKit';
import { partnerCurrency, useConvert } from './_data';

/** Only the last four digits are shown back — the app never needs the rest. */
const mask = (ref: string) => (ref.length > 4 ? `•••• ${ref.slice(-4)}` : ref);

/**
 * 38 · Linked.
 *
 * The reference in the params is what the partner normalised the typed number
 * to, so it is shown back rather than what was entered. The link itself is
 * re-read from the server rather than assumed from having arrived here: a
 * confirmation screen that says "linked" when the link didn't take is the one
 * failure this screen must not have.
 */
export default function LuluLinked() {
  const router = useRouter();
  const { brandId, memberRef } = useLocalSearchParams<{ brandId?: string; memberRef?: string }>();
  const { data, signedOut } = useConvert(brandId);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const terms = data?.terms;
  // Undefined while it loads — the screen doesn't contradict itself mid-flight.
  const confirmed = terms ? terms.linked : undefined;
  const partner = partnerCurrency(terms);

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <Disc>
          <Image source={require('@/assets/lulu-icon.png')} style={{ width: 48, height: 48, resizeMode: 'contain' }} />
        </Disc>
        <H1 style={{ marginTop: 32, textAlign: 'center' }}>
          {confirmed === false ? 'Not linked yet' : 'Lulu linked'}
        </H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 20, textAlign: 'center' }}>
          {confirmed === false
            ? 'The link didn’t come back confirmed. Try again and nothing will be duplicated.'
            : memberRef
              ? mask(memberRef)
              : 'Your account is connected.'}
        </Body>
        {confirmed && partner ? (
          <Small style={{ marginTop: 10, textAlign: 'center' }}>{`Your points can now become ${partner}.`}</Small>
        ) : null}
      </CenterState>

      <Footer>
        {confirmed === false ? (
          <Button
            label="Try again"
            onPress={() => router.replace({ pathname: '/convert/link', params: brandId ? { brandId } : {} })}
          />
        ) : (
          <Button
            label="Convert points now"
            onPress={() => router.replace({ pathname: '/convert', params: brandId ? { brandId } : {} })}
          />
        )}
        <TextAction label="Later" onPress={() => router.replace('/(tabs)/home')} />
      </Footer>
    </Screen>
  );
}
