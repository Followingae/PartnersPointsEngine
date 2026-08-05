import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { C, font } from '@/lib/tokens';

/**
 * "Add to Apple Wallet" / "Add to Google Wallet".
 *
 * Shows only the button for the platform in hand, and only when the server can
 * actually issue that kind of pass — a button that fails after the tap is worse
 * than no button.
 *
 * Both paths end in `Linking.openURL`. Apple's link is short-lived and carries
 * its own grant, so the pass opens straight into Wallet without the app needing
 * native file or sharing modules — which is what lets this ship over an OTA
 * update rather than waiting for a new build.
 */
export function AddToWallet({ membershipId }: { membershipId: string }) {
  const [available, setAvailable] = useState<{ apple: boolean; google: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ apple: boolean; google: boolean }>('/customer/wallet/passes/availability')
      .then((a) => live && setAvailable(a))
      .catch(() => live && setAvailable({ apple: false, google: false }));
    return () => {
      live = false;
    };
  }, []);

  const ios = Platform.OS === 'ios';
  const enabled = available && (ios ? available.apple : available.google);
  if (!enabled) return null;

  async function add() {
    setBusy(true);
    setFailed(false);
    try {
      const { url } = await api<{ url: string }>(
        `/customer/wallet/passes/${membershipId}/${ios ? 'apple' : 'google'}`,
      );
      await Linking.openURL(url);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 24, gap: 8 }}>
      <Pressable
        onPress={add}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={ios ? 'Add to Apple Wallet' : 'Add to Google Wallet'}
        style={({ pressed }) => ({
          height: 50,
          borderRadius: 12,
          backgroundColor: C.ink,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: pressed || busy ? 0.75 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: '#fff' }}>
            {ios ? 'Add to Apple Wallet' : 'Add to Google Wallet'}
          </Text>
        )}
      </Pressable>

      {failed ? (
        <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.crimson }}>
          That didn’t open. Check your connection and try again.
        </Text>
      ) : null}
    </View>
  );
}
