import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { StateScreen } from '@/components/StateScreen';
import { C } from '@/lib/tokens';

/**
 * 63 · Signed out.
 *
 * The reassurance is the whole screen: somebody who has just signed out of a
 * loyalty app wants to know their balance did not go with them.
 */
export default function SignedOut() {
  const router = useRouter();
  return (
    <StateScreen
      icon={
        <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </Svg>
      }
      title="Signed out. Your points are safe."
      body="Everything on your cards stays exactly where it is. Sign in with your number whenever you like."
      primaryLabel="Sign in"
      onPrimary={() => router.replace('/onboarding/phone')}
    />
  );
}
