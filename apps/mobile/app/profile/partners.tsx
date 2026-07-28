import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { BackBar, Icon, Lede, ListRow, TextAction, Tile } from '@/components/Bits';
import { Button, Card, Chip, H1, Screen, Small } from '@/components/UI';
import { C, R, font } from '@/lib/tokens';

export default function LinkedPartners() {
  const router = useRouter();

  // TODO(api): GET /customer/partners — link state and masked member ref.
  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Linked partners</H1>
      <Lede style={{ marginTop: 10 }}>Move points out of a card and into a partner programme.</Lede>

      <Card style={{ marginTop: 26, borderRadius: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <Tile size={48} radius={R.control} background={C.blue}>
            <Text style={{ fontFamily: font(800), fontSize: 20, lineHeight: 24, color: '#fff' }}>L</Text>
          </Tile>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: font(600), fontSize: 15.5, lineHeight: 22, color: C.ink }}>Lulu Happiness Points</Text>
            <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>•••• 4821</Small>
          </View>
          <Chip label="Linked" tone="green" />
        </View>

        <Button
          label="Convert points"
          tone="ghost"
          onPress={() => router.push('/convert')}
          style={{ marginTop: 16, height: 48 }}
        />
      </Card>

      <View style={{ marginTop: 4 }}>
        <ListRow
          divider={false}
          lead={<Tile><Icon name="share" size={19} /></Tile>}
          title="Conversion history"
          sub="Every transfer to Lulu"
          onPress={() => router.push('/convert/history')}
        />
      </View>

      <View
        style={{
          marginTop: 14,
          borderRadius: 22,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: C.hairline,
          padding: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 13,
        }}
      >
        <Tile size={48} radius={R.control}>
          <Icon name="info" size={22} color={C.soft} />
        </Tile>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.ink }}>More partners soon</Text>
          <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>We are adding new programmes to convert into.</Small>
        </View>
      </View>

      {/* TODO(api): DELETE /customer/partners/link */}
      <TextAction label="Unlink Lulu" />
    </Screen>
  );
}
