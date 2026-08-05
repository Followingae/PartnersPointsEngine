import Constants from 'expo-constants';
import { Image, Linking, View } from 'react-native';
import { BackBar, ListRow } from '@/components/Bits';
import { Screen, Small } from '@/components/UI';
import { C } from '@/lib/tokens';

/**
 * 61 · About.
 *
 * The legal rows open the real documents. Both stores require a reachable
 * privacy policy and reviewers do follow the link, so these cannot be labels —
 * and a customer looking for what they agreed to deserves to actually find it.
 */
const LEGAL: { title: string; url: string }[] = [
  { title: 'Terms of service', url: 'https://partnerspoints.ae/terms' },
  { title: 'Privacy policy', url: 'https://partnerspoints.ae/privacy' },
];

export default function About() {
  // Read from the manifest rather than hard-coded: a version printed here that
  // disagrees with the installed build makes every bug report ambiguous.
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.expoConfig?.android?.versionCode ?? '');

  return (
    <Screen scroll={false} bottomGap={24}>
      <BackBar fallback="/profile" />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={require('@/assets/pp-wordmark-dark.png')}
          style={{ width: 200, height: 48, resizeMode: 'contain' }}
        />
        <Small style={{ marginTop: 16, fontSize: 13, lineHeight: 18 }}>
          {build ? `Version ${version} (build ${build})` : `Version ${version}`}
        </Small>
      </View>

      <View>
        {LEGAL.map((l) => (
          <ListRow
            key={l.title}
            title={l.title}
            onPress={() => {
              void Linking.openURL(l.url);
            }}
          />
        ))}
        <Small style={{ marginTop: 22, textAlign: 'center', color: C.faint, fontSize: 12, lineHeight: 17 }}>
          Made in the UAE · © 2026 RFM Loyalty Co. LLC
        </Small>
      </View>
    </Screen>
  );
}
