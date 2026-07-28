import { useState } from 'react';
import { View } from 'react-native';
import { BackBar, Icon, Lede, ListRow } from '@/components/Bits';
import { H1, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
];

export default function LanguageSettings() {
  // TODO(api): persist on /customer/me and reload copy.
  const [code, setCode] = useState('en');

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Language</H1>
      <Lede style={{ marginTop: 10 }}>Applies to the app and to anything we send you.</Lede>

      <View style={{ marginTop: 24 }}>
        {LANGUAGES.map((l) => (
          <ListRow
            key={l.code}
            title={l.name}
            sub={l.native}
            onPress={() => setCode(l.code)}
            trailing={l.code === code ? <Icon name="check" size={20} color={C.ink} weight={2.4} /> : <View />}
          />
        ))}
      </View>
    </Screen>
  );
}
