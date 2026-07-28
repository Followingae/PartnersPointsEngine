import { useState } from 'react';
import { View } from 'react-native';
import { BackBar, Lede, ListRow, Toggle } from '@/components/Bits';
import { H1, Label, Screen, Small } from '@/components/UI';
import { C } from '@/lib/tokens';

// TODO(api): GET /customer/me/sessions
const SESSIONS = [
  { device: 'iPhone 15 · this device', where: 'Dubai · active now' },
  { device: 'iPad Air', where: 'Dubai · 3 days ago' },
];

export default function Security() {
  const [faceId, setFaceId] = useState(true);
  const [pin, setPin] = useState(true);

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Security</H1>
      <Lede style={{ marginTop: 10 }}>Face ID and the devices signed in to your account.</Lede>

      <View style={{ marginTop: 24 }}>
        <ListRow
          title="Face ID unlock"
          sub="Open the app with Face ID"
          onPress={() => setFaceId((v) => !v)}
          trailing={<Toggle on={faceId} />}
        />
        <ListRow
          title="App PIN"
          sub="6-digit fallback code"
          onPress={() => setPin((v) => !v)}
          trailing={<Toggle on={pin} />}
        />
        <ListRow title="Change phone number" sub="Verify a new number by SMS" />
      </View>

      <View style={{ marginTop: 30 }}>
        <Label>Devices</Label>
        <View style={{ marginTop: 8 }}>
          {SESSIONS.map((s, i) => (
            <ListRow
              key={s.device}
              divider={i > 0}
              title={s.device}
              sub={s.where}
              trailing={<Small style={{ fontSize: 12.5 }}>Sign out</Small>}
            />
          ))}
        </View>
        <Small style={{ marginTop: 14, color: C.faint }}>
          Signing out a device does not affect your points.
        </Small>
      </View>
    </Screen>
  );
}
