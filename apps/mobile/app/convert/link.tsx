import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, ErrorState, H1, Loading, Screen, Small } from '@/components/UI';
import { ApiError, getProfile, linkPartner } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, R, font } from '@/lib/tokens';
import { Footer, TopBar } from '@/components/RewardKit';
import { blockedReason, useConvert } from './_data';

/** The phone number is already verified, so it is shown rather than asked for. */
export default function LinkLulu() {
  const router = useRouter();
  const { brandId } = useLocalSearchParams<{ brandId?: string }>();
  const { data, loading, error, signedOut, refresh } = useConvert(brandId);
  const { data: profile } = useAsync(getProfile, []);

  const [member, setMember] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = data?.card;
  // The partner key belongs to the merchant's deal, not the app — the preview is
  // where it is published.
  const partnerKey = data?.terms?.partner.key;
  const blocked = blockedReason(data?.preview);

  async function submit() {
    if (!card || !partnerKey || sent.current) return;
    sent.current = true;
    setBusy(true);
    setFailed(null);
    try {
      // The partner normalises the reference, so the confirmation shows back
      // what was actually linked rather than what was typed.
      const { partnerMemberRef } = await linkPartner(card.brandId, partnerKey, member.trim());
      router.replace({
        pathname: '/convert/linked',
        params: { brandId: card.brandId, memberRef: partnerMemberRef },
      });
    } catch (e) {
      if (e instanceof ApiError && e.isAuth) {
        router.replace('/onboarding/phone');
        return;
      }
      setFailed(e instanceof Error ? e.message : 'Something went wrong');
      sent.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar />

      <H1 style={{ marginTop: 20 }}>Link your Lulu account</H1>
      <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22 }}>
        We only read your balance and add points.
      </Body>

      {loading ? <Loading /> : null}

      {!loading && error && !data ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && blocked ? (
        <Small style={{ marginTop: 26, fontSize: 13.5, lineHeight: 20 }}>{blocked}</Small>
      ) : null}

      {card && !blocked ? (
        <>
          <View style={{ marginTop: 28, gap: 12 }}>
            <View style={{
              height: 58, borderRadius: R.tile, backgroundColor: C.canvas,
              justifyContent: 'center', paddingHorizontal: 18,
            }}>
              <Text style={{ fontFamily: font(600), fontSize: 16, lineHeight: 22, color: C.ink }}>
                {profile?.phone ?? ' '}
              </Text>
            </View>

            <TextInput
              value={member}
              onChangeText={setMember}
              placeholder="Lulu member number"
              placeholderTextColor={C.soft}
              keyboardType="number-pad"
              editable={!busy}
              style={{
                height: 58,
                borderRadius: R.tile,
                backgroundColor: C.surface,
                borderWidth: 1.5,
                borderColor: C.hairline,
                paddingHorizontal: 18,
                fontFamily: font(member ? 600 : 500),
                fontSize: 16, lineHeight: 22,
                color: C.ink,
              }}
            />
          </View>

          {failed ? (
            <Small style={{ marginTop: 16, fontSize: 13, lineHeight: 19, color: C.crimson }}>{failed}</Small>
          ) : null}

          <Footer>
            <Button
              label={failed ? 'Try again' : 'Link account'}
              loading={busy}
              disabled={member.trim().length === 0 || !partnerKey}
              onPress={submit}
            />
          </Footer>
        </>
      ) : null}
    </Screen>
  );
}
