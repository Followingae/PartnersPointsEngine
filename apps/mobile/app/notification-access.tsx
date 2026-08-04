import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { StateScreen } from '@/components/StateScreen';
import { requestNotifications } from '@/lib/push';
import { C } from '@/lib/tokens';

/**
 * 66 · Notification access.
 *
 * Asks for the OS permission and registers the device so the server can reach
 * it later. Sending is a separate piece of work that does not exist yet, which
 * is why the copy promises what notifications are *for* rather than that they
 * will start arriving today — a permission prompt that over-promises is how an
 * app gets its notifications turned off for good.
 */
export default function NotificationAccess() {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile/notifications'));

  async function turnOn() {
    const r = await requestNotifications();
    if (r === 'blocked') {
      void Linking.openSettings();
      return;
    }
    back();
  }

  return (
    <StateScreen
      icon={
        <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
          <Path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </Svg>
      }
      title="Know when points land"
      body="Earned points, ready rewards and expiry warnings. No marketing unless you ask."
      primaryLabel="Turn on"
      onPrimary={turnOn}
      secondaryLabel="Later"
      onSecondary={back}
    />
  );
}
