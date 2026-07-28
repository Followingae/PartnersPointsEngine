import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, H1, Screen, pts } from '@/components/UI';
import { C } from '@/lib/tokens';
import { CenterState, Disc, Footer, Ic, NotePill, TextAction } from '@/components/RewardKit';

/**
 * The transfer did not land.
 *
 * The API's own message is shown as-is — it is the one that knows whether this
 * was a daily limit, an unlinked account or the partner refusing. When the
 * server answered, it has already voided the hold and refunded the merchant's
 * allowance, so "nothing was deducted" is a fact. When nothing answered at all
 * that promise can't be made, and the screen sends the customer to the record
 * instead of offering a retry that could transfer twice.
 */
export default function TransferFailed() {
  const router = useRouter();
  const { brandId, amount, message, outcome } = useLocalSearchParams<{
    brandId?: string; amount?: string; message?: string; outcome?: string;
  }>();

  const points = Number(amount ?? 0) || 0;
  const unresolved = outcome === 'unknown';

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <Disc>
          <Ic name="alert" size={40} sw={1.7} />
        </Disc>
        <H1 style={{ marginTop: 32, textAlign: 'center' }}>
          {unresolved ? 'Transfer unconfirmed' : 'Transfer failed'}
        </H1>
        <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22.5, textAlign: 'center' }}>
          {message ?? 'The transfer could not be completed.'}
          {unresolved
            ? ' Check your transfers before trying again — it may still have gone through.'
            : points > 0
              ? ` Your ${pts(points)} points were not deducted.`
              : ''}
        </Body>
        {unresolved ? null : <NotePill label="Nothing was deducted" />}
      </CenterState>

      <Footer>
        {unresolved ? (
          <Button label="See my transfers" onPress={() => router.replace('/convert/history')} />
        ) : (
          <Button
            label="Try again"
            onPress={() => router.replace({ pathname: '/convert', params: brandId ? { brandId } : {} })}
          />
        )}
        <TextAction label="Back to cards" onPress={() => router.replace('/(tabs)/home')} />
      </Footer>
    </Screen>
  );
}
