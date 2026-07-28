import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SettingsHeader, Toggle } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { font } from '@/lib/tokens';

const INITIAL = [
  { title: 'Points earned', desc: 'When you earn at a merchant', on: true },
  { title: 'Happy hour & offers', desc: 'Time-limited promos near you', on: true },
  { title: 'Expiring points', desc: 'Reminders before points expire', on: true },
  { title: 'Conversions', desc: 'Lulu transfer updates', on: true },
  { title: 'Marketing emails', desc: 'News & partner offers', on: false },
];

export default function NotificationSettings() {
  const t = useTokens();
  const [rows, setRows] = useState(INITIAL);
  const toggle = (i: number) => setRows((r) => r.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));
  // TODO(api): persist notification preferences
  return (
    <Screen>
      <SettingsHeader title="Notifications" />
      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        {rows.map((n, i) => (
          <Pressable
            key={n.title}
            onPress={() => toggle(i)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 13,
              paddingVertical: 16,
              borderBottomWidth: i === rows.length - 1 ? 0 : 1,
              borderBottomColor: t.line,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>{n.title}</Text>
              <Text style={{ fontSize: 12, color: t.soft }}>{n.desc}</Text>
            </View>
            <Toggle on={n.on} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
