import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { BackBar, Lede, ListRow, Toggle } from '@/components/Bits';
import { Body, ErrorState, H1, Loading, Screen, Small } from '@/components/UI';
import { getProfile, updateProfile } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, S } from '@/lib/tokens';

/**
 * Messaging preferences.
 *
 * One switch, because one preference exists: `txnAlertsOptOut`. The earlier
 * version of this screen listed six, none of which the server knew about —
 * a promise the product couldn't keep. The rest arrive here as they ship.
 *
 * The toggle flips straight away and is put back if the save fails, so the
 * switch always shows what the server holds rather than what was tapped.
 */
export default function Notifications() {
  const router = useRouter();
  const { data, loading, error, signedOut, refresh, set } = useAsync(getProfile);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  // The stored flag is an opt-*out*; the switch reads as an opt-in.
  const on = data ? !data.txnAlertsOptOut : false;

  const toggle = async () => {
    if (!data || saving) return;
    const optOut = !data.txnAlertsOptOut;
    setSaving(true);
    setSaveError(null);
    set((p) => (p ? { ...p, txnAlertsOptOut: optOut } : p));
    try {
      const fresh = await updateProfile({ txnAlertsOptOut: optOut });
      set(() => fresh);
    } catch (e) {
      set((p) => (p ? { ...p, txnAlertsOptOut: !optOut } : p));
      setSaveError(e instanceof Error ? e.message : 'Could not save that. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Notifications</H1>
      <Lede style={{ marginTop: 10 }}>Choose what we send you on WhatsApp.</Lede>

      {loading ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <View style={{ marginTop: 24 }}>
            <ListRow
              title="Transaction updates"
              sub="A WhatsApp after each purchase, with your receipt and the points you earned"
              onPress={toggle}
              trailing={
                saving
                  ? <ActivityIndicator color={C.soft} />
                  : <Toggle on={on} />
              }
            />
          </View>

          {saveError ? (
            <Body style={{ marginTop: 16, color: S.spend }}>{saveError}</Body>
          ) : null}

          <Small style={{ marginTop: 22 }}>
            Sign-in codes are not affected by this. They are how you get into your account, so they
            are always sent.
          </Small>

          <Small style={{ marginTop: 12 }}>
            {on
              ? 'Turning this off stops the message at the source — nothing is sent, by us or by a brand.'
              : 'You will still see every purchase in your activity feed.'}
          </Small>
        </>
      )}
    </Screen>
  );
}
