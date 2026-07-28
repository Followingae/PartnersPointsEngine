import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share, Text, View } from 'react-native';
import { Icon, Lede, TextAction } from '@/components/Bits';
import { Button, ErrorState, H1, Loading, Screen } from '@/components/UI';
import { getBadges } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, R } from '@/lib/tokens';
import { badgeColor, badgeGlyph, findAward } from '@/app/badges/_data';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * 46 · Badge unlocked — the celebration the app pushes after an earn.
 *
 * Awards carry no id of their own, so the route param is the badge's name and
 * the brand comes along as a query param; there is no per-badge endpoint, so
 * the brand's award list is fetched and the one badge picked out of it.
 */
export default function BadgeUnlocked() {
  const params = useLocalSearchParams<{ id: string; brandId?: string }>();
  const router = useRouter();
  const name = one(params.id);
  const brandId = one(params.brandId);

  const { data, loading, error, signedOut, refresh } = useAsync(
    () => (brandId ? getBadges(brandId) : Promise.resolve([])),
    [brandId],
  );

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const award = findAward(data, name);
  const dismiss = () => (router.canGoBack() ? router.back() : router.replace('/badges'));

  if (loading) {
    return <Screen><Loading /></Screen>;
  }
  if (error && !award) {
    return <Screen><ErrorState message={error} onRetry={refresh} /></Screen>;
  }

  const color = badgeColor(award?.badge.name ?? name ?? '');
  const icon = award?.badge.icon?.trim();

  return (
    <Screen scroll={false} bottomGap={34}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
        <View
          style={{
            width: 148,
            height: 148,
            borderRadius: 44,
            backgroundColor: award ? color : C.wash,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon
            ? <Text style={{ fontSize: 66, lineHeight: 80 }}>{icon}</Text>
            : <Icon name={award ? 'trophy' : 'lock'} size={66} color={badgeGlyph(color)} weight={1.4} />}
        </View>
        <H1 style={{ marginTop: 34, textAlign: 'center' }}>{award?.badge.name ?? name ?? 'Badge'}</H1>
        <Lede center style={{ marginTop: 12, paddingHorizontal: 4 }}>
          {award ? `Earned on ${day(award.awardedAt)}.` : 'You haven’t earned this one yet.'}
        </Lede>
      </View>

      <View>
        <Button
          label={award ? 'Nice' : 'Got it'}
          onPress={dismiss}
          style={{ borderRadius: R.card, height: 58 }}
        />
        {award ? (
          <TextAction
            label="Share"
            onPress={() => {
              void Share.share({ message: `I just earned the ${award.badge.name} badge on Partners Points.` });
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}
