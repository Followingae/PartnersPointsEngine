import { Share, Text, View } from 'react-native';
import { Amount, BackBar, Icon, Lede, ListRow, Tile } from '@/components/Bits';
import { Button, H1, Label, Screen, Small } from '@/components/UI';
import { C, R, S, font } from '@/lib/tokens';

// TODO(api): GET /customer/referrals — code plus the people it brought in.
const CODE = 'MAYA200';
const INVITED = [
  { name: 'Sara', sub: 'Joined · earned', value: '+200', earned: true },
  { name: 'Omar', sub: 'Joined · no visit yet', value: 'Pending', earned: false },
];

export default function Referrals() {
  const share = () => {
    Share.share({ message: `Join me on Partners Points — use code ${CODE} and we both get 200 points.` });
  };

  return (
    <Screen scroll={false} bottomGap={34}>
      <BackBar fallback="/home" />

      <View style={{ flex: 1 }}>
        <H1 style={{ marginTop: 20 }}>Invite a friend</H1>
        <Lede style={{ marginTop: 10 }}>They get 200 pts, you get 200 once they earn.</Lede>

        <View style={{ marginTop: 28, padding: 24, borderRadius: 22, backgroundColor: C.wash, alignItems: 'center' }}>
          <Label style={{ fontSize: 11.5, lineHeight: 16, color: C.muted }}>Your code</Label>
          <Text style={{ marginTop: 12, fontFamily: font(600), fontSize: 30, lineHeight: 35, letterSpacing: 4.2, color: C.ink }}>
            {CODE}
          </Text>
        </View>

        <View style={{ marginTop: 30 }}>
          <Label>Invited</Label>
          <View style={{ marginTop: 8 }}>
            {INVITED.map((p, i) => (
              <ListRow
                key={p.name}
                divider={i > 0}
                lead={<Tile><Icon name="user" size={19} /></Tile>}
                title={p.name}
                sub={p.sub}
                trailing={
                  p.earned
                    ? <Amount value={p.value} color={S.earnInk} />
                    : <Small style={{ fontSize: 12.5, lineHeight: 18 }}>{p.value}</Small>
                }
              />
            ))}
          </View>
        </View>
      </View>

      <Button label="Share my code" onPress={share} style={{ borderRadius: R.card, height: 58 }} />
    </Screen>
  );
}
