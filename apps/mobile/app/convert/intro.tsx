import { useEffect } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, EmptyState, ErrorState, H1, Loading, Screen, pts } from '@/components/UI';
import { C } from '@/lib/tokens';
import { Footer, ListRow, TopBar } from '@/components/RewardKit';
import { blockedReason, partnerCurrency, pointsPerPartnerPoint, useConvert } from './_data';

/**
 * Screen 36 — the "why would I do this" pitch before linking Lulu.
 *
 * The rate and the minimum are the merchant's, not the app's, so they are
 * quoted from the same preview the picker and the confirm screen quote from.
 * A brand with no partner deal says so here rather than at the last step.
 */
export default function ConvertIntro() {
  const router = useRouter();
  const { brandId } = useLocalSearchParams<{ brandId?: string }>();
  const { data, loading, error, signedOut, refresh } = useConvert(brandId);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = data?.card;
  const terms = data?.terms;
  const blocked = blockedReason(data?.preview);
  const perPoint = pointsPerPartnerPoint(terms?.ratioBps);
  const params = card ? { brandId: card.brandId } : {};

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar />

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
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Image
              source={require('@/assets/lulu-wordmark.png')}
              style={{ height: 26, width: 96, resizeMode: 'contain', alignSelf: 'flex-start' }}
            />

            <H1 style={{ marginTop: 26, lineHeight: 36.5 }}>Turn points into {partnerCurrency(terms)}</H1>

            <Body tone="muted" style={{ marginTop: 14, fontSize: 14.5, lineHeight: 23 }}>
              {blocked
                ?? `Your ${card.brandName} points move to Lulu at a fixed rate. Groceries, electronics, anything in store.`}
            </Body>

            {blocked ? null : (
              <View style={{ marginTop: 30 }}>
                <ListRow
                  icon="swap"
                  title={
                    perPoint === null
                      ? 'A fixed rate'
                      : `${perPoint.toLocaleString('en-US', { maximumFractionDigits: 2 })} pts = 1 Lulu point`
                  }
                  sub={
                    terms && terms.minConversion > 0
                      ? `From ${pts(terms.minConversion)} pts, and shown again before you confirm`
                      : 'Rate is fixed and shown before you confirm'
                  }
                />
                <ListRow icon="check" title="Instant" sub="Balance updates on both sides" divider />
                <ListRow icon="alert" title="One way" sub="Lulu points cannot come back" divider />
              </View>
            )}
          </View>

          <Footer>
            {blocked ? (
              <Button
                label="Back"
                tone="ghost"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
              />
            ) : terms?.linked ? (
              <Button
                label="Convert points"
                onPress={() => router.replace({ pathname: '/convert', params })}
              />
            ) : (
              <Button
                label="Link my Lulu account"
                onPress={() => router.push({ pathname: '/convert/link', params })}
              />
            )}
          </Footer>
        </>
      ) : null}
    </Screen>
  );
}
