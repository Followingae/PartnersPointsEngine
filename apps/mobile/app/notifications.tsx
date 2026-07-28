import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SettingsHeader } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

const ITEMS = [
  { emoji: '⚡', tile: 'rgba(191,242,5,0.22)', title: 'Happy hour is live now', sub: '2× points at Camel Bean until 6 PM', unread: true },
  { emoji: '🔁', tile: 'rgba(11,4,217,0.1)', title: '560 Lulu points added', sub: 'Your conversion completed · ref CNV·8821', unread: true },
  { emoji: '🎁', tile: 'chip', title: 'A reward is now affordable', sub: 'Free flat white · 450 pts', unread: false },
  { emoji: '⌛', tile: 'chip', title: '90 points expiring soon', sub: 'Núr Pâtisserie · expires 30 Jul', unread: false },
  { emoji: '🎂', tile: 'chip', title: 'Happy birthday, Maya!', sub: 'Enjoy 2× points all month', unread: false, last: true },
];

export default function Notifications() {
  const t = useTokens();
  return (
    <Screen>
      <SettingsHeader title="Notifications" right={<Text style={{ fontFamily: font.sans(600), fontSize: 12.5, color: BRAND.blue }}>Mark all read</Text>} />
      <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
        {ITEMS.map((n, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 13,
              paddingVertical: 14,
              borderBottomWidth: n.last ? 0 : 1,
              borderBottomColor: t.line,
              opacity: n.unread ? 1 : 0.7,
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: n.tile === 'chip' ? t.chip : n.tile, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 17 }}>{n.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.ink }}>{n.title}</Text>
              <Text style={{ fontSize: 12.5, color: t.soft, marginTop: 2 }}>{n.sub}</Text>
            </View>
            {n.unread ? <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: BRAND.blue, marginTop: 5 }} /> : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}
