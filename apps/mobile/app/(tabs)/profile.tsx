import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Icon, ListRow, Tile, type IconName } from '@/components/Bits';
import { H1, Screen, Small } from '@/components/UI';
import { C, font } from '@/lib/tokens';

// TODO(api): GET /customer/me for the name, phone and partner link state.
const ME = { name: 'Maya Khoury', phone: '+971 50 123 4567', initials: 'MK' };

const ROWS: { icon: IconName; title: string; sub: string; href: string }[] = [
  { icon: 'user', title: 'Personal details', sub: 'Name, birthday, email', href: '/profile/edit' },
  { icon: 'card', title: 'Linked partners', sub: 'Lulu · connected', href: '/profile/partners' },
  { icon: 'bell', title: 'Notifications', sub: 'Per brand and per type', href: '/profile/notifications' },
  { icon: 'shield', title: 'Security', sub: 'Face ID, sessions', href: '/profile/security' },
  { icon: 'lock', title: 'Privacy and data', sub: 'Export or delete', href: '/profile/privacy' },
  { icon: 'globe', title: 'Language', sub: 'English', href: '/profile/language' },
  { icon: 'help', title: 'Help and support', sub: 'Answers and contact', href: '/help' },
  { icon: 'info', title: 'About', sub: 'Version, terms, privacy', href: '/about' },
  { icon: 'logout', title: 'Sign out', sub: 'You can come back any time', href: '/signout' },
];

export default function Profile() {
  const router = useRouter();
  return (
    <Screen>
      <H1 style={{ marginTop: 16 }}>Profile</H1>

      <View style={{ marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            backgroundColor: C.wash,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: font(600), fontSize: 20, color: C.muted }}>{ME.initials}</Text>
        </View>
        <View>
          <Text style={{ fontFamily: font(600), fontSize: 19, letterSpacing: -0.38, color: C.ink }}>{ME.name}</Text>
          <Small style={{ marginTop: 4, fontSize: 13 }}>{ME.phone}</Small>
        </View>
      </View>

      <View style={{ marginTop: 26 }}>
        {ROWS.map((r) => (
          <ListRow
            key={r.title}
            lead={<Tile><Icon name={r.icon} size={19} /></Tile>}
            title={r.title}
            sub={r.sub}
            onPress={() => router.push(r.href)}
          />
        ))}
      </View>
    </Screen>
  );
}
