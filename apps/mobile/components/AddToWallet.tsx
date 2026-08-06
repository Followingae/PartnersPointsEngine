import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { C, font } from '@/lib/tokens';

/**
 * "Add to Apple Wallet" / "Add to Google Wallet".
 *
 * Shows only the button for the platform in hand, and only when the server can
 * actually issue that kind of pass — a button that fails after the tap is worse
 * than no button.
 *
 * The Apple button is Apple's own badge artwork, rendered from the SVG they
 * publish. Their guidelines are explicit that you may not draw your own version
 * and may not use the Wallet icon on its own, so the badge is the whole
 * control: the icon, the wording and the pill are all theirs, and nothing is
 * layered over it.
 *
 * (In a fully native app the correct control is PKAddPassButton. That is a
 * UIKit view with no React Native binding, and adding one means a native module
 * — which cannot ship over an OTA update. The badge is the approved artwork for
 * everything else, so it is what this uses.)
 *
 * Both paths end in `Linking.openURL`. Apple's link is short-lived and carries
 * its own grant, so the pass opens straight into Wallet without the app needing
 * native file or sharing modules.
 */

/** Apple's badge, at the ratio they ship it. Distorting it is not permitted. */
const BADGE_RATIO = 110.739 / 35.016;
const BADGE_HEIGHT = 44;

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
    // Left-aligned and sized to its content. Apple's guidelines require the
    // badge to stay secondary to the screen's own message, which a full-width
    // bar does not.
    <View style={{ marginTop: 24, gap: 8, alignItems: 'flex-start' }}>
      <Pressable
        onPress={add}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Add to Apple Wallet"
        // The badge carries its own shape and padding, so the only thing added
        // here is the pressed state. No shadow, no tint, no overlay.
        style={({ pressed }) => ({ opacity: pressed || busy ? 0.75 : 1 })}
      >
        {ios ? (
          <View>
            <Image
              source={require('@/assets/add-to-apple-wallet.png')}
              style={{ height: BADGE_HEIGHT, width: BADGE_HEIGHT * BADGE_RATIO }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            {busy ? (
              // Centred over the badge rather than replacing it: swapping the
              // artwork out mid-tap reads as the button having disappeared.
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
          </View>
        ) : (
          // Google publishes its own badge under separate terms. Until that
          // artwork is in hand this stays plain type rather than an imitation
          // of it — the same rule, applied to the other platform.
          <View
            style={{
              height: BADGE_HEIGHT,
              paddingHorizontal: 18,
              borderRadius: 8,
              backgroundColor: C.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 20, color: '#fff' }}>
                Add to Google Wallet
              </Text>
            )}
          </View>
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
