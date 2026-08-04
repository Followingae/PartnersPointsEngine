import { Linking, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { StateScreen } from '@/components/StateScreen';
import { C } from '@/lib/tokens';

/**
 * 68 · Update required.
 *
 * The one state with no way past it: a build the ledger will not talk to
 * cannot be allowed to show balances, because whatever it showed would be
 * wrong. So there is no secondary action here by design.
 */
export default function UpdateRequired() {
  return (
    <StateScreen
      icon={
        <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 19V5M5 12l7-7 7 7" />
        </Svg>
      }
      title="Time to update"
      body="This version no longer talks to the points ledger. The update takes a moment and your cards come back exactly as they were."
      primaryLabel="Update"
      onPrimary={() => {
        void Linking.openURL(
          Platform.OS === 'ios'
            ? (process.env.EXPO_PUBLIC_APP_STORE_URL ?? 'https://partnerspoints.ae')
            : (process.env.EXPO_PUBLIC_PLAY_STORE_URL ?? 'https://partnerspoints.ae'),
        );
      }}
    />
  );
}
