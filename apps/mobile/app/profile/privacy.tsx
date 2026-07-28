import { useState } from 'react';
import { Text, View } from 'react-native';
import { BackBar, Icon, Lede, ListRow, Tile, Toggle } from '@/components/Bits';
import { H1, Label, Screen, Small } from '@/components/UI';
import { C, S, font } from '@/lib/tokens';

export default function Privacy() {
  const [personalised, setPersonalised] = useState(true);
  const [share, setShare] = useState(false);

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Privacy and data</H1>
      <Lede style={{ marginTop: 10 }}>What we use your activity for, and how to take it back.</Lede>

      <View style={{ marginTop: 24 }}>
        <ListRow
          title="Personalised offers"
          sub="Use my activity to tailor offers"
          onPress={() => setPersonalised((v) => !v)}
          trailing={<Toggle on={personalised} />}
        />
        <ListRow
          title="Share data with merchants"
          sub="Let merchants see your tier"
          onPress={() => setShare((v) => !v)}
          trailing={<Toggle on={share} />}
        />
      </View>

      <View style={{ marginTop: 30 }}>
        <Label>Your data</Label>
        <View style={{ marginTop: 8 }}>
          {/* TODO(api): POST /customer/me/export */}
          <ListRow
            divider={false}
            lead={<Tile><Icon name="share" size={19} /></Tile>}
            title="Download my data"
            sub="A copy of your profile and ledger"
          />
          {/* TODO(api): POST /customer/me/delete */}
          <ListRow
            lead={<Tile background="rgba(255,31,107,.12)"><Icon name="lock" size={19} color={S.spend} /></Tile>}
            title="Delete my account"
            sub="Removes your profile and unspent points"
            trailing={<Text style={{ fontFamily: font(600), fontSize: 13, color: S.spend }}>Delete</Text>}
          />
        </View>
        <Small style={{ marginTop: 14, color: C.faint }}>
          Deletion is permanent and takes up to 30 days to complete.
        </Small>
      </View>
    </Screen>
  );
}
