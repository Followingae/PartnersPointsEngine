import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Icon, ListRow, Tile, type IconName } from '@/components/Bits';
import { ErrorState, H1, Loading, Screen, Small } from '@/components/UI';
import { getProfile, type Profile as ProfileData } from '@/lib/api';
import { personInitials } from '@/lib/brand';
import { detailsSummary } from '@/lib/profile';
import { useAsync } from '@/lib/useAsync';
import { C, font } from '@/lib/tokens';

/**
 * Things you do, above the things you configure.
 *
 * Challenges, badges, referrals and the streak were all built and wired but
 * nothing in the app navigated to them, so they may as well not have existed.
 * They belong together, ahead of the settings rows.
 */
const FEATURE_ROWS: { icon: IconName; title: string; sub: string; href: string }[] = [
  { icon: 'trophy', title: 'Challenges', sub: 'Stamp cards and goals you’re working on', href: '/challenges' },
  { icon: 'shield', title: 'Badges', sub: 'What you’ve earned so far', href: '/badges' },
  { icon: 'flame', title: 'Streak', sub: 'Your run of visits', href: '/streak' },
  { icon: 'share', title: 'Invite friends', sub: 'Share your code, you both benefit', href: '/referrals' },
];

const ROWS: { icon: IconName; title: string; sub: string; href: string }[] = [
  { icon: 'user', title: 'Personal details', sub: 'Name, birthday, nationality', href: '/profile/edit' },
  { icon: 'card', title: 'Linked partners', sub: 'Convert points to a partner', href: '/profile/partners' },
  { icon: 'bell', title: 'Notifications', sub: 'What we send you on WhatsApp', href: '/profile/notifications' },
  { icon: 'shield', title: 'Security', sub: 'Face ID, sessions', href: '/profile/security' },
  { icon: 'lock', title: 'Privacy and data', sub: 'Export or delete', href: '/profile/privacy' },
  { icon: 'globe', title: 'Language', sub: 'English', href: '/profile/language' },
  { icon: 'help', title: 'Help and support', sub: 'Answers and contact', href: '/help' },
  { icon: 'info', title: 'About', sub: 'Version, terms, privacy', href: '/about' },
  { icon: 'logout', title: 'Sign out', sub: 'You can come back any time', href: '/signout' },
];

/**
 * Two rows answer for the profile rather than describing themselves: personal
 * details says what is still missing, and notifications says whether the
 * post-purchase WhatsApp is on. Both fall back to the static copy until the
 * profile loads.
 */
function subtitle(href: string, fallback: string, p: ProfileData | undefined): string {
  if (!p) return fallback;
  if (href === '/profile/edit') return detailsSummary(p);
  if (href === '/profile/notifications') {
    return p.txnAlertsOptOut ? 'Transaction updates are off' : 'Transaction updates are on';
  }
  return fallback;
}

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
        {FEATURE_ROWS.map((r) => (
          <ListRow
            key={r.title}
            lead={<Tile><Icon name={r.icon} size={19} /></Tile>}
            title={r.title}
            sub={r.sub}
            onPress={() => router.push(r.href)}
          />
        ))}
      </View>

      <View style={{ marginTop: 26 }}>
        {ROWS.map((r) => (
          <ListRow
            key={r.title}
            lead={<Tile><Icon name={r.icon} size={19} /></Tile>}
            title={r.title}
            sub={subtitle(r.href, r.sub, data)}
            onPress={() => router.push(r.href)}
          />
        ))}
      </View>
    </Screen>
  );
}
