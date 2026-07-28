import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BrandCard, SAMPLE_BRANDS, SponsoredOffer } from '@/components/BrandCard';
import { Header, IconButton, Screen } from '@/components/UI';
import { C, font } from '@/lib/tokens';

/** 09 · Cards (home) — the deck of brand cards plus one paid placement. */

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <Path d="M10.5 20a1.8 1.8 0 0 0 3 0" />
    </Svg>
  );
}

/** Cards overlap so only each one's header row peeks above the next. */
const CARD_HEIGHT = 200;
const PEEK = 68;

export default function CardsHome() {
  const router = useRouter();
  // TODO(api): deck order and contents come from the customer's wallet.
  const deck = SAMPLE_BRANDS.slice(0, 3);
  const deckHeight = PEEK * (deck.length - 1) + CARD_HEIGHT;

  return (
    <Screen background={C.surface}>
      <Header
        title="Cards"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton onPress={() => router.push('/notifications')}>
              <BellIcon />
            </IconButton>
            <IconButton onPress={() => router.push('/(tabs)/profile')} style={{ borderRadius: 999 }}>
              {/* TODO(api): the signed-in customer's initials. */}
              <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.muted }}>MK</Text>
            </IconButton>
          </View>
        }
      />

      <View style={{ height: deckHeight, marginTop: 8 }}>
        {deck.map((b, i) => (
          <View key={b.id} style={{ position: 'absolute', left: 0, right: 0, top: i * PEEK, zIndex: i + 1 }}>
            <BrandCard
              name={b.name}
              initial={b.initial}
              color={b.color}
              tier={b.tier}
              points={b.points}
              footnote={b.footnote}
              progress={b.progress}
              onPress={() => router.push(`/wallet/${b.id}`)}
            />
          </View>
        ))}
      </View>

      <View style={{ marginTop: 34 }}>
        {/* TODO(api): sponsored placements come from the offers feed. */}
        <SponsoredOffer
          name="Núr Pâtisserie"
          initial="N"
          color={C.purple}
          headline="Free slice over AED 60"
          cta="Join Núr"
          onPress={() => router.push('/wallet/nur-patisserie')}
        />
      </View>
    </Screen>
  );
}
