import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, ErrorState, Loading, Screen } from '@/components/UI';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { getDiscoverBrands, type DiscoverBrand } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, font } from '@/lib/tokens';
import { Footer, Monogram, Sub, TextLink, Title } from './_components';

/**
 * 08 · First card — four real brands, tappable.
 *
 * The design showed distances, but a brand carries no location in the API, so
 * the second line is what the brand's points are actually called. Tapping a
 * tile goes to the join sheet rather than joining outright: joining shares the
 * customer's name and number with the brand, and that is said out loud there.
 *
 * Brands already in the wallet are left out — this step is about the first
 * card, and offering one they hold would be a dead tile.
 */

const TILES = 4;

function BrandTile({ brand, onPress }: { brand: DiscoverBrand; onPress: () => void }) {
  const bg = brandColor(brand.brandId, brand.branding);
  const ink = brandFg(bg);
  // The badge is a veil over the fill, so it reads on light and dark brands alike.
  const badge = ink === '#fff' ? 'rgba(255,255,255,.2)' : 'rgba(21,21,15,.17)';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          height: 120,
          borderRadius: 20,
          padding: 16,
          backgroundColor: bg,
          justifyContent: 'space-between',
        },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Monogram code={brandInitials(brand.brandName)} size={26} radius={9} bg={badge} color={ink} fontSize={10} />
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: ink }}
        >
          {brand.brandName}
        </Text>
      </View>

      <View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={{ fontFamily: font(600), fontSize: 26, lineHeight: 30, letterSpacing: -0.78, color: ink }}>0</Text>
          <Text style={{ fontFamily: font(500), fontSize: 11, lineHeight: 15, color: ink }}>pts</Text>
        </View>
        <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: font(500), fontSize: 11, lineHeight: 15, color: ink }}>
          {`Earn ${brand.pointsCode}`}
        </Text>
      </View>
    </Pressable>
  );
}

export default function FirstMerchant() {
  const router = useRouter();
  const { data, loading, error, signedOut, refresh } = useAsync(getDiscoverBrands, []);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const joinable = (data ?? []).filter((b) => !b.joined).slice(0, TILES);
  const rows = [joinable.slice(0, 2), joinable.slice(2)].filter((r) => r.length > 0);

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      {loading ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            {rows.length > 0 ? (
              <View style={{ gap: 12 }}>
                {rows.map((row, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                    {row.map((b) => (
                      <BrandTile key={b.brandId} brand={b} onPress={() => router.push(`/join/${b.brandId}`)} />
                    ))}
                    {/* A lone tile on the second row keeps the first row's width. */}
                    {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                  </View>
                ))}
              </View>
            ) : null}

            <Title style={{ marginTop: rows.length > 0 ? 38 : 0 }}>
              {rows.length > 0 ? 'Add your first card' : 'No brands to join yet'}
            </Title>
            <Sub style={{ marginTop: 12, lineHeight: 23 }}>
              {rows.length > 0
                ? 'Join a brand and start earning on your next visit.'
                : 'New brands appear here as they join Partners Points.'}
            </Sub>
          </View>

          <Footer>
            <Button
              label={rows.length > 0 ? 'Browse brands' : 'Go to my cards'}
              onPress={() => router.replace(rows.length > 0 ? '/discover' : '/home')}
            />
            <TextLink label="Scan a code in store" onPress={() => router.replace('/scan')} />
          </Footer>
        </>
      )}
    </Screen>
  );
}
