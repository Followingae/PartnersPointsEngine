import { useState } from 'react';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { StateScreen } from '@/components/StateScreen';
import { apiReachable } from '@/lib/api';
import { C } from '@/lib/tokens';

/**
 * 67 · Maintenance.
 *
 * Shown when the API answers 503. Retrying is the only sensible action, and it
 * is a real retry — the app re-checks rather than pretending.
 */
export default function Maintenance() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  async function retry() {
    setChecking(true);
    const up = await apiReachable();
    setChecking(false);
    if (up) router.replace('/home');
  }

  return (
    <StateScreen
      icon={
        <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 8v5M12 16.5v.01" />
          <Path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </Svg>
      }
      title="Back at 6 AM"
      body="We're doing some work on the points ledger. Your balances are untouched."
      primaryLabel="Try again"
      onPrimary={retry}
      primaryLoading={checking}
    />
  );
}
