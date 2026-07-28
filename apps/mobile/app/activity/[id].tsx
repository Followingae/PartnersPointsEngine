import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share, Text, View } from 'react-native';
import { BackBar, Icon, RoundButton, TextAction } from '@/components/Bits';
import { Card, Label, Row, Screen, Small } from '@/components/UI';
import { C, font } from '@/lib/tokens';
import { amountColor, findEntry } from '@/app/activity/_data';

/** 51 · Transaction detail — the receipt behind an activity row. */
export default function Transaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // TODO(api): GET /customer/activity/:id
  const e = findEntry(id);
  const tone = amountColor(e.kind);

  const share = () => {
    Share.share({ message: `${e.title} · ${e.when} · ${e.amount} pts (${e.ref})` });
  };

  return (
    <Screen scroll={false} bottomGap={34}>
      <BackBar
        fallback="/activity"
        right={<RoundButton onPress={share}><Icon name="share" size={18} weight={1.9} /></RoundButton>}
      />

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Card style={{ borderRadius: 22, paddingVertical: 26, paddingHorizontal: 24 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.ink }}>{e.title}</Text>
            <Small style={{ marginTop: 5, fontSize: 12.5, lineHeight: 18 }}>{`${e.when} · ${e.ref}`}</Small>
          </View>

          <View style={{ marginTop: 26, alignItems: 'center' }}>
            <Text style={{ fontFamily: font(600), fontSize: 48, lineHeight: 56, letterSpacing: -1.9, color: tone }}>{e.amount}</Text>
            <Label style={{ marginTop: 6, fontSize: 12, lineHeight: 17, letterSpacing: 1.2 }}>{e.bigLabel}</Label>
          </View>

          <View
            style={{
              marginTop: 26,
              paddingTop: 22,
              borderTopWidth: 1,
              borderStyle: 'dashed',
              borderTopColor: C.hairline,
              gap: 15,
            }}
          >
            {e.lines.map((l) => (
              <Row key={l.label} label={l.label} value={l.value} />
            ))}
          </View>
        </Card>
      </View>

      <TextAction label="Something wrong? Contact support" onPress={() => router.push('/help/contact')} />
    </Screen>
  );
}
