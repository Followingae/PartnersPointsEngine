import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { BackBar, Icon, Lede, ListRow, Tile } from '@/components/Bits';
import { Button, H1, Label, Screen } from '@/components/UI';
import { R } from '@/lib/tokens';

const FAQ = [
  { q: 'How does converting to Lulu work?', a: 'Rates, limits and timing' },
  { q: 'When do my points expire?', a: 'Per brand, after 12 months idle' },
  { q: 'How do I move to a new phone?', a: 'Sign in with the same number' },
  { q: 'Why did I not earn points?', a: 'Common reasons and fixes' },
];

export default function Help() {
  const router = useRouter();
  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>How can we help?</H1>
      <Lede style={{ marginTop: 10 }}>Answers to the questions we get most.</Lede>

      <View style={{ marginTop: 26 }}>
        <Label>Popular</Label>
        <View style={{ marginTop: 8 }}>
          {FAQ.map((f, i) => (
            <ListRow
              key={f.q}
              divider={i > 0}
              lead={<Tile><Icon name="help" size={19} /></Tile>}
              title={f.q}
              sub={f.a}
            />
          ))}
        </View>
      </View>

      <Button
        label="Contact support"
        onPress={() => router.push('/support')}
        style={{ marginTop: 26, borderRadius: R.card, height: 58 }}
      />
    </Screen>
  );
}
