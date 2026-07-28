import { Linking, View } from 'react-native';
import { BackBar, Icon, Lede, ListRow, Tile } from '@/components/Bits';
import { Card, H1, Label, Screen, Small } from '@/components/UI';
import { C, R } from '@/lib/tokens';

const CHANNELS = [
  {
    icon: 'help' as const,
    title: 'Chat with us',
    sub: 'Usually replies in a few minutes',
    url: 'https://wa.me/97145550000',
  },
  {
    icon: 'globe' as const,
    title: 'support@partnerspoints.ae',
    sub: 'Best for receipts and account questions',
    url: 'mailto:support@partnerspoints.ae',
  },
  {
    icon: 'bell' as const,
    title: '+971 4 555 0000',
    sub: 'Sun–Thu, 9am to 6pm Gulf time',
    url: 'tel:+97145550000',
  },
];

export default function ContactSupport() {
  return (
    <Screen>
      <BackBar fallback="/help" />

      <H1 style={{ marginTop: 20 }}>Talk to a human</H1>
      <Lede style={{ marginTop: 10 }}>
        Pick whichever suits you. Have your receipt handy if it is about a purchase.
      </Lede>

      <View style={{ marginTop: 26 }}>
        <Label>Ways to reach us</Label>
        <View style={{ marginTop: 8 }}>
          {CHANNELS.map((c, i) => (
            <ListRow
              key={c.title}
              divider={i > 0}
              lead={<Tile><Icon name={c.icon} size={19} /></Tile>}
              title={c.title}
              sub={c.sub}
              onPress={() => Linking.openURL(c.url)}
            />
          ))}
        </View>
      </View>

      <Card style={{ marginTop: 24, backgroundColor: C.wash, borderRadius: R.card }}>
        <Small>
          Points missing from a purchase? Open it in Activity and tap “Something wrong?” — that
          sends us the transaction, so we can fix it without you typing anything out.
        </Small>
      </Card>
    </Screen>
  );
}
