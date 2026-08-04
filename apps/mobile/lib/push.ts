/**
 * Notification permission, and the device token that goes with it.
 *
 * Asking is one thing; being able to reach the device is another. Registering
 * the token here means the day the server starts sending, every customer who
 * already said yes is reachable — rather than a migration where everyone is
 * asked a second time.
 *
 * Sending is deliberately not implemented. There is no push service on the API
 * yet, and pretending otherwise in the permission copy is how an app gets its
 * notifications turned off permanently.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerPushToken } from '@/lib/api';

export type PushOutcome = 'granted' | 'denied' | 'blocked' | 'unsupported';

/** Where the token is sent. Failing to register must not fail the permission. */
async function record(token: string): Promise<void> {
  try {
    await registerPushToken(token, Platform.OS);
  } catch {
    /* the permission is what the customer asked for; the rest is our problem */
  }
}

export async function notificationStatus(): Promise<PushOutcome> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    return canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'unsupported';
  }
}

/**
 * Asks, and registers on success.
 *
 * Returns `blocked` when the OS will no longer show its dialog — the caller
 * sends those to Settings, because asking again does nothing at all.
 */
export async function requestNotifications(): Promise<PushOutcome> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== 'granted' && !current.canAskAgain) return 'blocked';

    const { status } = current.status === 'granted'
      ? current
      : await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return 'denied';

    // Android needs a channel before anything it delivers will make a sound.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Points and rewards',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return 'granted';

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (data) await record(data);
    return 'granted';
  } catch {
    return 'unsupported';
  }
}
