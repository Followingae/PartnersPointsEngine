import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Screen, pts } from '@/components/UI';
import { C, R, font, shadow } from '@/lib/tokens';
import { Footer, Monogram, TextLink, Title } from './_components';

type Wallet = {
  code: string; name: string; tier: string; points: number;
  bg: string; ink: string; badge: string;
};

/** The three cards that fan out behind the headline. */
const WALLETS: Wallet[] = [
  { code: 'V', name: 'Verde Market', tier: 'Green', points: 760, bg: C.green, ink: C.ink, badge: 'rgba(21,21,15,.15)' },
  { code: 'N', name: 'Núr Pâtisserie', tier: 'Silver', points: 1150, bg: C.purple, ink: '#fff', badge: 'rgba(255,255,255,.18)' },
  { code: 'CB', name: 'Camel Bean', tier: 'Gold', points: 2480, bg: C.orange, ink: C.ink, badge: 'rgba(21,21,15,.15)' },
];

function StackCard({ w, top, depth }: { w: Wallet; top: number; depth: number }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top, zIndex: depth }}>
      <View
        style={{
          height: 168, borderRadius: R.sheet, padding: 24, backgroundColor: w.bg,
          justifyContent: 'space-between', ...shadow.card,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
            <Monogram code={w.code} size={38} radius={12} bg={w.badge} color={w.ink} fontSize={13} />
            <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 17, lineHeight: 24, letterSpacing: -0.17, color: w.ink }}>
              {w.name}
            </Text>
          </View>
          <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: w.ink }}>{w.tier}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontFamily: font(600), fontSize: 48, lineHeight: 55, letterSpacing: -1.44, color: w.ink }}>
            {pts(w.points)}
          </Text>
          <Text style={{ fontFamily: font(500), fontSize: 14, lineHeight: 20, color: w.ink }}>pts</Text>
        </View>
      </View>
    </View>
  );
}

/** 02 · Value carousel — first of three value slides. */
export default function Carousel() {
  const router = useRouter();
  const next = () => router.push('/onboarding/phone');

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable onPress={next} hitSlop={10}>
          <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.muted }}>Skip</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ height: 272 }}>
          {WALLETS.map((w, i) => (
            <StackCard key={w.code} w={w} top={i * 52} depth={i + 1} />
          ))}
        </View>

        <Title style={{ marginTop: 44 }}>Every card in one place</Title>
        <Body tone="muted" style={{ marginTop: 12, lineHeight: 23 }}>
          Points, tiers and rewards for every brand you visit.
        </Body>
      </View>

      <Footer>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 24 }}>
          <View style={{ width: 20, height: 6, borderRadius: 999, backgroundColor: C.ink }} />
          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: 'rgba(21,21,15,.08)' }} />
          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: 'rgba(21,21,15,.08)' }} />
        </View>
        <Button label="Get started" onPress={next} />
        <TextLink label="I already have points" onPress={next} />
      </Footer>
    </Screen>
  );
}
