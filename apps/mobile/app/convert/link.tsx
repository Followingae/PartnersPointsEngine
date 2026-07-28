import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, H1, Screen } from '@/components/UI';
import { C, R, font } from '@/lib/tokens';
import { Footer, TopBar } from '@/components/RewardKit';

/** Screen 37 — the phone number is already known; only the member number is asked for. */
export default function LinkLulu() {
  const router = useRouter();
  const [member, setMember] = useState('');

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar />

      <H1 style={{ marginTop: 20 }}>Link your Lulu account</H1>
      <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 22 }}>
        We only read your balance and add points.
      </Body>

      <View style={{ marginTop: 28, gap: 12 }}>
        {/* Verified at sign-up, so it is shown rather than asked for. */}
        <View style={{
          height: 58, borderRadius: R.tile, backgroundColor: C.canvas,
          justifyContent: 'center', paddingHorizontal: 18,
        }}>
          <Text style={{ fontFamily: font(600), fontSize: 16, lineHeight: 22, color: C.ink }}>+971 50 123 4567</Text>
        </View>

        <TextInput
          value={member}
          onChangeText={setMember}
          placeholder="Lulu member number"
          placeholderTextColor={C.soft}
          keyboardType="number-pad"
          style={{
            height: 58,
            borderRadius: R.tile,
            backgroundColor: C.surface,
            borderWidth: 1.5,
            borderColor: C.hairline,
            paddingHorizontal: 18,
            fontFamily: font(member ? 600 : 500),
            fontSize: 16, lineHeight: 22,
            color: C.ink,
          }}
        />
      </View>

      <Footer>
        {/* TODO(api): link the Lulu membership and store the returned account handle. */}
        <Button label="Link account" onPress={() => router.replace('/convert/linked')} />
      </Footer>
    </Screen>
  );
}
