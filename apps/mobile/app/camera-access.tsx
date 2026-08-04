import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import Svg, { Circle, Path } from 'react-native-svg';
import { StateScreen } from '@/components/StateScreen';
import { C } from '@/lib/tokens';

/**
 * 65 · Camera access.
 *
 * Reached from the scanner when permission is missing. The button does the
 * real thing: asks the OS while that is still possible, and sends them to
 * Settings once it isn't — iOS only shows its dialog once, and a button that
 * silently does nothing the second time is worse than no button.
 */
export default function CameraAccess() {
  const router = useRouter();
  const [permission, request] = useCameraPermissions();
  const canAsk = permission?.canAskAgain !== false;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/scan'));

  async function allow() {
    if (canAsk) {
      const r = await request();
      if (r.granted) {
        router.replace('/scan/camera');
        return;
      }
    }
    void Linking.openSettings();
  }

  return (
    <StateScreen
      tint={C.pink}
      icon={
        <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-2h6.2l1.2 2h1.7A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5Z" />
          <Circle cx={12} cy={12.5} r={3.2} />
        </Svg>
      }
      title="Camera for codes"
      body="Only used when you open the scanner. Nothing is recorded."
      primaryLabel={canAsk ? 'Allow camera' : 'Open Settings'}
      onPrimary={allow}
      secondaryLabel="Not now"
      onSecondary={back}
    />
  );
}
