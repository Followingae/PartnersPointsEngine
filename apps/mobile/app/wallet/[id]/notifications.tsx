import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Body, ErrorState, H1, IconButton, Loading, Screen, Small } from '@/components/UI';
import { getCards, getProfile, updateProfile } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, S, font } from '@/lib/tokens';

/**
 * 18 · Brand notifications.
 *
 * The design shows four per-brand switches. There is no per-brand preference
 * model — the server holds exactly one messaging preference, `txnAlertsOptOut`,
 * and it is account-wide. Rendering four switches that silently forget three of
 * themselves is the failure `app/profile/notifications.tsx` already documents,
 * so this screen shows the one preference that exists and says plainly that it
 * covers every brand. The others land here when the server can hold them.
 */

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ width: 46, height: 28, borderRadius: 999, backgroundColor: on ? C.ink : C.wash, justifyContent: 'center' }}
    >
      <View
        style={{
          position: 'absolute', top: 3, left: on ? 21 : 3,
          width: 22, height: 22, borderRadius: 999, backgroundColor: '#fff',
          shadowColor: '#15150F', shadowOpacity: 0.18, shadowRadius: 5,
          shadowOffset: { width: 0, height: 2 }, elevation: 2,
        }}
      />
    </Pressable>
  );
}

function PrefRow({ title, sub, trailing, first }: {
  title: string; sub: string; trailing: React.ReactNode; first?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
        borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{title}</Text>
        <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{sub}</Small>
      </View>
      {trailing}
    </View>
  );
}

export default function BrandNotifications() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brandId = Array.isArray(id) ? id[0]! : id!;
  const router = useRouter();

  const profile = useAsync(getProfile, []);
  const cards = useAsync(getCards, []);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.signedOut || cards.signedOut) router.replace('/onboarding/phone');
  }, [profile.signedOut, cards.signedOut, router]);

  const brandName = cards.data?.find((c) => c.brandId === brandId)?.brandName ?? '';
  // The stored flag is an opt-*out*; the switch reads as an opt-in.
  const on = profile.data ? !profile.data.txnAlertsOptOut : false;

  const toggle = async () => {
    const current = profile.data;
    if (!current || saving) return;
    const optOut = !current.txnAlertsOptOut;
    setSaving(true);
    setSaveError(null);
    profile.set((p) => (p ? { ...p, txnAlertsOptOut: optOut } : p));
    try {
      const fresh = await updateProfile({ txnAlertsOptOut: optOut });
      profile.set(() => fresh);
    } catch (e) {
      profile.set((p) => (p ? { ...p, txnAlertsOptOut: !optOut } : p));
      setSaveError(e instanceof Error ? e.message : 'Could not save that. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen background={C.surface} bottomGap={40} refreshing={profile.refreshing} onRefresh={profile.refresh}>
      <View style={{ marginTop: 2 }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
      </View>

      <View style={{ marginTop: 20 }}>
        <H1 style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>{brandName || 'Notifications'}</H1>
        <Body tone="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 20 }}>
          What you get after a visit — here and at every brand
        </Body>
      </View>

      {profile.loading ? (
        <Loading />
      ) : profile.error && !profile.data ? (
        <ErrorState message={profile.error} onRetry={profile.refresh} />
      ) : (
        <>
          <View style={{ marginTop: 24 }}>
            <PrefRow
              first
              title="Points earned"
              sub="A WhatsApp after each purchase, with your receipt and the points you earned"
              trailing={saving ? <ActivityIndicator color={C.soft} /> : <Toggle on={on} onPress={toggle} />}
            />
          </View>

          {saveError ? (
            <Body style={{ marginTop: 16, fontSize: 14, lineHeight: 20, color: S.spend }}>{saveError}</Body>
          ) : null}

          <Small style={{ marginTop: 22, fontSize: 12.5, lineHeight: 18 }}>
            This switch is set once for your whole account, not per brand — turning it off here turns
            it off for {brandName ? `${brandName} and ` : ''}every other card in your wallet.
          </Small>

          <Small style={{ marginTop: 12, fontSize: 12.5, lineHeight: 18 }}>
            Reward, expiry and offer alerts aren’t sent yet. When they are, you’ll be able to choose
            them brand by brand here.
          </Small>

          <Small style={{ marginTop: 12, fontSize: 12.5, lineHeight: 18 }}>
            Sign-in codes are not affected. They are how you get into your account, so they are always
            sent.
          </Small>
        </>
      )}
    </Screen>
  );
}
