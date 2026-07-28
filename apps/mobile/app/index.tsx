import { Redirect } from 'expo-router';

/** Launch → splash (the onboarding flow decides where to go next). */
export default function Index() {
  return <Redirect href="/onboarding/splash" />;
}
