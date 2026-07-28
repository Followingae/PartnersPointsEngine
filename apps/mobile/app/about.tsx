import { Image, View } from 'react-native';
import { BackBar, ListRow } from '@/components/Bits';
import { Screen, Small } from '@/components/UI';
import { C } from '@/lib/tokens';

const LEGAL = ['Terms of service', 'Privacy policy', 'Licences'];

export default function About() {
  return (
    <Screen scroll={false} bottomGap={24}>
      <BackBar fallback="/profile" />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={require('@/assets/pp-wordmark-dark.png')}
          style={{ width: 200, height: 48, resizeMode: 'contain' }}
        />
        <Small style={{ marginTop: 16, fontSize: 13 }}>Version 1.0.0 (build 142)</Small>
      </View>

      <View>
        {LEGAL.map((l) => (
          <ListRow key={l} title={l} />
        ))}
        <Small style={{ marginTop: 22, textAlign: 'center', color: C.faint, fontSize: 12 }}>
          Made in the UAE · © 2026 Partners Points
        </Small>
      </View>
    </Screen>
  );
}
