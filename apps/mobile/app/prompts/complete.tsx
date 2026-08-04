import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { StateScreen } from '@/components/StateScreen';
import { settle } from '@/lib/prompts';
import { C } from '@/lib/tokens';

/**
 * 83 · Profile complete.
 *
 * The design ended this with "150 pts added, split across your three cards".
 * Nothing pays for personal information, so it thanks them and says what it
 * changes instead — which is the honest version of the same moment.
 *
 * Settles every prompt on the way out: there is nothing left to ask, and a
 * popup appearing after this screen would be absurd.
 */
export default function ProfileComplete() {
  const router = useRouter();

  useEffect(() => {
    void Promise.all([
      settle('profile'),
      settle('birthday'),
      settle('nationality'),
      settle('home-branch'),
    ]);
  }, []);

  return (
    <StateScreen
      tint={C.lime}
      icon={
        <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 12.5l4.5 4.5L19 7.5" />
        </Svg>
      }
      title="Profile complete"
      body="Thank you. What brands send you should get noticeably less generic from here."
      primaryLabel="Back to cards"
      onPrimary={() => router.replace('/home')}
    />
  );
}
