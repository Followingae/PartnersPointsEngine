/**
 * Notification permission — what we can honestly do about it today.
 *
 * There is no push service on the API. Nothing sends. So the app's job here is
 * to explain what notifications would be for and take someone to the place
 * they are switched on, not to collect a device token for a sender that does
 * not exist.
 *
 * `expo-notifications` is deliberately not used. It imports three packages it
 * never declares, which pnpm's isolated layout hides from Metro; the fix is to
 * hoist node_modules, and hoisting resolves two copies of React into the two
 * Next consoles and breaks their production build. Destabilising two working
 * apps to satisfy a permission primer for a feature nobody has built is a bad
 * trade. When push is real, the SDK arrives with it and this file goes.
 *
 * The server already accepts a device token (`POST /customer/wallet/push-token`),
 * so the day it is built there is somewhere for it to go.
 */
import { Linking } from 'react-native';

export type PushOutcome = 'settings' | 'unsupported';

/**
 * Opens the OS settings page for this app, which is where notification
 * permission genuinely lives on both platforms.
 */
export async function openNotificationSettings(): Promise<PushOutcome> {
  try {
    await Linking.openSettings();
    return 'settings';
  } catch {
    return 'unsupported';
  }
}
