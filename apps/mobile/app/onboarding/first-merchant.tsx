import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen } from '@/components/UI';
import { C, font } from '@/lib/tokens';
import { Footer, Monogram, Sub, TextLink, Title } from './_components';

type Nearby = { code: string; name: string; meta: string; bg: string; ink: string; badge: string };

/** Brands to join, in the order the design lays them out (row-major). */
const NEARBY: Nearby[] = [
  { code: 'CB', name: 'Camel Bean', meta: 'Coffee · 0.4 km', bg: C.orange, ink: C.ink, badge: 'rgba(21,21,15,.17)' },
  { code: 'BC', name: 'Bloom Coffee', meta: 'Coffee · 0.8 km', bg: C.blue, ink: '#fff', badge: 'rgba(255,255,255,.2)' },
  { code: 'V', name: 'Verde Market', meta: 'Grocery · 1.2 km', bg: C.green, ink: C.ink, badge: 'rgba(21,21,15,.17)' },
  { code: 'OT', name: 'Olive & Thyme', meta: 'Dining · 1.4 km', bg: C.pink, ink: C.ink, badge: 'rgba(21,21,15,.17)' },
];

function BrandTile({ brand }: { brand: Nearby }) {
  return (
    <View
      style={{
        flex: 1, height: 120, borderRadius: 20, padding: 16,
        backgroundColor: brand.bg, justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Monogram code={brand.code} size={26} radius={9} bg={brand.badge} color={brand.ink} fontSize={10} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: brand.ink }}>
          {brand.name}
        </Text>
      </View>

      <View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={{ fontFamily: font(600), fontSize: 26, lineHeight: 30, letterSpacing: -0.78, color: brand.ink }}>0</Text>
          <Text style={{ fontFamily: font(500), fontSize: 11, lineHeight: 15, color: brand.ink }}>pts</Text>
        </View>
        <Text style={{ marginTop: 6, fontFamily: font(500), fontSize: 11, lineHeight: 15, color: brand.ink }}>{brand.meta}</Text>
      </View>
    </View>
  );
}

/** 08 · First card. */
export default function FirstMerchant() {
  const router = useRouter();

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {NEARBY.slice(0, 2).map((b) => <BrandTile key={b.code} brand={b} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {NEARBY.slice(2).map((b) => <BrandTile key={b.code} brand={b} />)}
          </View>
        </View>

        <Title style={{ marginTop: 38 }}>Add your first card</Title>
        <Sub style={{ marginTop: 12, lineHeight: 23 }}>Join a brand and start earning on your next visit.</Sub>
      </View>

      <Footer>
        <Button label="Browse brands" onPress={() => router.replace('/(tabs)/home')} />
        <TextLink label="Scan a code in store" onPress={() => router.replace('/(tabs)/scan')} />
      </Footer>
    </Screen>
  );
}
