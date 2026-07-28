import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, H2, Loading, Small } from '@/components/UI';
import { brandColor } from '@/components/BrandCard';
import { getDiscoverBrands, joinBrand } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, S, SP, font } from '@/lib/tokens';

/** 23 · Join confirmation — the brand behind a scrim, terms in a bottom sheet. */

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function JoinConfirm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const brandId = one(useLocalSearchParams<{ id: string }>().id);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, loading, signedOut } = useAsync(getDiscoverBrands);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const brand = data?.find((b) => b.brandId === brandId);
  const tone = brandId ? brandColor(brandId, brand?.branding) : C.wash;

  const join = async () => {
    if (!brandId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await joinBrand(brandId);
      // Re-joining is a no-op server-side, so the celebration is only honest
      // the first time; an existing member goes straight to the card.
      router.replace(r.alreadyMember ? `/wallet/${brandId}` : `/join/success?id=${brandId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join right now.');
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: tone }}>
      <Pressable onPress={() => router.back()} style={{ flex: 1, backgroundColor: 'rgba(21,21,15,.45)' }} />

      <View
        style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 30, borderTopRightRadius: 30,
          paddingHorizontal: SP.gutter, paddingTop: 14, paddingBottom: 32 + insets.bottom,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: C.hairline }} />
        </View>

        {loading ? (
          <Loading />
        ) : (
          <>
            <H2 style={{ marginTop: 22, fontSize: 26, lineHeight: 32, letterSpacing: -0.65 }}>
              Join {brand?.brandName ?? 'this brand'}?
            </H2>
            <Body tone="muted" style={{ marginTop: 10, fontSize: 14, lineHeight: 21.7 }}>
              Your name and number are shared with the brand. You can leave any time from card settings.
            </Body>

            {/* The design listed an earn rate and a points expiry; the brand list
                carries neither, so the one term we can state truthfully stands
                alone until an endpoint serves the programme's rules. */}
            {brand ? (
              <View style={{ marginTop: 22, paddingVertical: 18 }}>
                <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>Points</Text>
                <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 3 }}>
                  You collect {brand.pointsCode} at {brand.brandName}
                </Text>
              </View>
            ) : null}

            {error ? <Small style={{ marginTop: 6, color: S.spend }}>{error}</Small> : null}

            <View style={{ marginTop: 26 }}>
              <Button
                label={brand?.joined ? 'Open card' : 'Join'}
                onPress={join}
                loading={busy}
                disabled={busy || !brandId}
                style={{ height: 58, borderRadius: 18, backgroundColor: tone }}
              />
              <Pressable onPress={() => router.back()} style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted }}>Not now</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
