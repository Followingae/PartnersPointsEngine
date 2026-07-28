import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, pts } from '@/components/UI';
import { C, font } from '@/lib/tokens';
import { Footer, Monogram, Sub, Title } from './_components';

type Linked = { code: string; name: string; points: number; bg: string; ink: string };

/** Cards the number already has points on. */
const LINKED: Linked[] = [
  { code: 'CB', name: 'Camel Bean', points: 2480, bg: C.orange, ink: C.ink },
  { code: 'N', name: 'Núr Pâtisserie', points: 1150, bg: C.purple, ink: '#fff' },
  { code: 'V', name: 'Verde Market', points: 760, bg: C.green, ink: C.ink },
];

function LinkedRow({ card }: { card: Linked }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Monogram code={card.code} size={44} radius={14} bg={card.bg} color={card.ink} fontSize={14} />
      <Text style={{ flex: 1, fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.ink }}>{card.name}</Text>
      <Text style={{ fontFamily: font(600), fontSize: 20, lineHeight: 24, letterSpacing: -0.6, color: C.ink }}>{pts(card.points)}</Text>
    </View>
  );
}

/** 05 · Account found. */
export default function AccountFound() {
  const router = useRouter();

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Title>We found your points</Title>
        <Sub style={{ marginTop: 10 }}>{`${LINKED.length} cards are already linked to your number.`}</Sub>

        <View style={{ marginTop: 32, gap: 12 }}>
          {LINKED.map((card) => <LinkedRow key={card.code} card={card} />)}
        </View>
      </View>

      <Footer>
        <Button label="Open my cards" onPress={() => router.push('/onboarding/biometric')} />
      </Footer>
    </Screen>
  );
}
