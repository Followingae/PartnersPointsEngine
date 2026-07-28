import { View } from 'react-native';
import { Body, H1, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';
import { GroupLabel, ListRow, TopBar } from '@/components/RewardKit';

/** Screen 42 — every transfer to Lulu, newest first, grouped by month. */
export default function TransferHistory() {
  return (
    <Screen background={C.surface} bottomGap={30}>
      <TopBar />

      <H1 style={{ marginTop: 20 }}>Transfers</H1>
      <Body tone="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 22 }}>
        To Lulu Happiness Points
      </Body>

      {/* TODO(api): list transfers; sample rows come from the design. */}
      <View style={{ marginTop: 24 }}>
        <GroupLabel>July</GroupLabel>
        <ListRow title="2,000 pts → 400 Lulu" sub="12 Jul · complete" chevron />
        <ListRow title="1,000 pts → 200 Lulu" sub="3 Jul · complete" chevron divider />

        <GroupLabel style={{ marginTop: 22 }}>June</GroupLabel>
        <ListRow title="2,500 pts → 500 Lulu" sub="21 Jun · complete" chevron />
        <ListRow title="1,500 pts" sub="14 Jun · failed, refunded" value="Refunded" valueTone="faint" divider />
      </View>
    </Screen>
  );
}
