import { useState } from 'react';
import { View } from 'react-native';
import { BackBar, Lede, ListRow, Toggle } from '@/components/Bits';
import { H1, Screen } from '@/components/UI';

// TODO(api): GET/PATCH /customer/me/notifications
const INITIAL = [
  { title: 'Points earned', desc: 'When you earn at a merchant', on: true },
  { title: 'Happy hour and offers', desc: 'Time-limited promos near you', on: true },
  { title: 'Expiring points', desc: 'Reminders before points expire', on: true },
  { title: 'Challenges and streaks', desc: 'Progress and reminders', on: true },
  { title: 'Conversions', desc: 'Lulu transfer updates', on: true },
  { title: 'Marketing emails', desc: 'News and partner offers', on: false },
];

export default function Notifications() {
  const [rows, setRows] = useState(INITIAL);
  const toggle = (i: number) => setRows((r) => r.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Notifications</H1>
      <Lede style={{ marginTop: 10 }}>Choose what reaches you, per brand and per type.</Lede>

      <View style={{ marginTop: 24 }}>
        {rows.map((n, i) => (
          <ListRow
            key={n.title}
            title={n.title}
            sub={n.desc}
            onPress={() => toggle(i)}
            trailing={<Toggle on={n.on} />}
          />
        ))}
      </View>
    </Screen>
  );
}
