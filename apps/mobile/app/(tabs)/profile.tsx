import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Icon, ListRow, Tile, type IconName } from '@/components/Bits';
import { ErrorState, H1, Loading, Screen, Small } from '@/components/UI';
import { getProfile } from '@/lib/api';
import { personInitials } from '@/lib/brand';
import { useAsync } from '@/lib/useAsync';
import { C, font } from '@/lib/tokens';

const ROWS: { icon: IconName; title: string; sub: string; href: string }[] = [
  { icon: 'user', title: 'Personal details', sub: 'Name, birthday, email', href: '/profile/edit' },
  { icon: 'card', title: 'Linked partners', sub: 'Convert points to a partner', href: '/profile/partners' },
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
  const { data, loading, refreshing, error, signedOut, refresh } = useAsync(getProfile);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  // Someone can reach this screen before they have given us a name.
  const initials = personInitials(data?.fullName);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <H1 style={{ marginTop: 16 }}>Profile</H1>

      {loading ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
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
            {initials ? (
              <Text style={{ fontFamily: font(600), fontSize: 20, lineHeight: 24, color: C.muted }}>{initials}</Text>
            ) : (
              <Icon name="user" size={26} color={C.muted} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font(600), fontSize: 19, lineHeight: 23, letterSpacing: -0.38, color: C.ink }}
            >
              {data?.fullName ?? 'Add your name'}
            </Text>
            {data?.phone ? (
              <Small style={{ marginTop: 4, fontSize: 13, lineHeight: 18 }}>{data.phone}</Small>
            ) : null}
          </View>
        </View>
      )}

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
