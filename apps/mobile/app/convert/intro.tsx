import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, H1, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';
import { Footer, ListRow, TopBar } from '@/components/RewardKit';

/** Screen 36 — the "why would I do this" pitch before linking Lulu. */
export default function ConvertIntro() {
  const router = useRouter();

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar />

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Image
          source={require('@/assets/lulu-wordmark.png')}
          style={{ height: 26, width: 96, resizeMode: 'contain', alignSelf: 'flex-start' }}
        />

        <H1 style={{ marginTop: 26, lineHeight: 36.5 }}>Turn points into Lulu Happiness Points</H1>

        <Body tone="muted" style={{ marginTop: 14, fontSize: 14.5, lineHeight: 23 }}>
          Points from any brand can move to Lulu at a fixed rate. Groceries, electronics, anything in store.
        </Body>

        <View style={{ marginTop: 30 }}>
          <ListRow icon="swap" title="5 pts = 1 Lulu point" sub="Rate is fixed and shown before you confirm" />
          <ListRow icon="check" title="Instant" sub="Balance updates on both sides" divider />
          <ListRow icon="alert" title="One way" sub="Lulu points cannot come back" divider />
        </View>
      </View>

      <Footer>
        <Button label="Link my Lulu account" onPress={() => router.push('/convert/link')} />
      </Footer>
    </Screen>
  );
}
