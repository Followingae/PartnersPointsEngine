import { useRouter } from 'expo-router';
import { ReactNode, useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { EmptyState, ErrorState, H1, IconButton, Label, Loading, Screen, Small } from '@/components/UI';
import { getActivity, getVouchers, type ActivityEvent, type Voucher } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, font } from '@/lib/tokens';

/**
 * 12 · Notifications — the account-wide feed.
 *
 * There is no notification service and no read/unread state on the server, so
 * this is not a message inbox: it is the things worth telling someone about,
 * derived from what the wallet already knows. Points landing, a reward becoming
 * usable, points or a reward about to lapse, a transfer out to a partner — all
 * of it read from the activity feed and the voucher list.
 *
 * Deriving it rather than leaving the mock in place means the screen is never
 * wrong, and it costs nothing to replace with a real feed later: the same rows
 * would come from the same events.
 */

const stroke = { fill: 'none', stroke: C.ink, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function BackIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" {...stroke}><Path d="M15 5l-7 7 7 7" /></Svg>;
}
function PlusIcon() {
  return <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}><Path d="M12 5v14M5 12h14" /></Svg>;
}
function CupIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}>
      <Path d="M5 6h11v6a5.5 5.5 0 0 1-11 0z" />
      <Path d="M16 8h2.5a2.5 2.5 0 0 1 0 5H16M4 20h13" />
    </Svg>
  );
}
function AlertIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}>
      <Path d="M12 4.5l8.5 15H3.5z" />
      <Path d="M12 10v4M12 17h.01" />
    </Svg>
  );
}
function ConvertIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}>
      <Path d="M17 4v6h-6M7 20v-6h6" />
      <Path d="M19 10a7 7 0 0 0-13-2M5 14a7 7 0 0 0 13 2" />
    </Svg>
  );
}

function NotifRow({ icon, tile, title, time, first }: {
  icon: ReactNode; tile: string; title: string; time: string; first?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
        borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
      }}
    >
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: tile, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{title}</Text>
        <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{time}</Small>
      </View>
    </View>
  );
}

const GREEN = 'rgba(0,179,126,.14)';
const AMBER = 'rgba(255,171,61,.18)';

interface Notice {
  key: string;
  at: Date;
  icon: ReactNode;
  tile: string;
  title: string;
  time: string;
}

/** Which events are worth a notification. The rest belong in the activity feed. */
const NOTIFIABLE = new Set(['earn', 'expiry', 'transfer', 'voucher_issued', 'voucher_redeemed', 'voucher_expired']);

/** Points come pre-signed ("+120" / "−90"); the row's wording carries the sign. */
const magnitude = (points: string | null) => (points ?? '').replace(/[^0-9]/g, '');

const DAY = 24 * 60 * 60 * 1000;

/** "2:41 PM" today, "Yesterday", a weekday within the week, then a date. */
function timeLabel(at: Date, now: Date): string {
  if (at.toDateString() === now.toDateString()) {
    return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now.getTime() - DAY);
  if (at.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (now.getTime() - at.getTime() < 7 * DAY) return at.toLocaleDateString('en-US', { weekday: 'short' });
  return at.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function eventNotice(e: ActivityEvent, now: Date): Notice | null {
  if (!NOTIFIABLE.has(e.type)) return null;
  const at = new Date(e.at);
  const time = timeLabel(at, now);
  const where = e.brandName ? ` at ${e.brandName}` : '';
  const base = { key: e.id, at, time };

  switch (e.type) {
    case 'earn':
      return { ...base, icon: <PlusIcon />, tile: GREEN, title: `${e.points ?? ''} pts${where}` };
    case 'expiry':
      return { ...base, icon: <AlertIcon />, tile: AMBER, title: `${magnitude(e.points)} pts expired${where}` };
    case 'transfer':
      return { ...base, icon: <ConvertIcon />, tile: C.wash, title: `${magnitude(e.points)} pts transferred${where}` };
    case 'voucher_issued':
      return { ...base, icon: <CupIcon />, tile: C.wash, title: `${e.rewardName ?? 'Reward'} ready${where}` };
    case 'voucher_redeemed':
      return { ...base, icon: <CupIcon />, tile: C.wash, title: `${e.rewardName ?? 'Reward'} used${where}` };
    case 'voucher_expired':
      return { ...base, icon: <AlertIcon />, tile: AMBER, title: `${e.rewardName ?? 'Reward'} expired${where}` };
    default:
      return null;
  }
}

/** A reward still in hand that lapses within a fortnight is worth saying now. */
function expiringSoon(vouchers: Voucher[], now: Date): Notice[] {
  return vouchers
    .filter((v) => v.status === 'issued' && v.expiresAt)
    .map((v) => ({ v, at: new Date(v.expiresAt!) }))
    .filter(({ at }) => at.getTime() > now.getTime() && at.getTime() - now.getTime() <= 14 * DAY)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ v, at }) => {
      const days = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / DAY));
      return {
        key: `soon:${v.id}`,
        at,
        icon: <AlertIcon />,
        tile: AMBER,
        title: `${v.rewardName} expires${v.brandName ? ` at ${v.brandName}` : ''}`,
        time: days === 1 ? 'Tomorrow' : `In ${days} days`,
      };
    });
}

function Group({ label, notices, style }: { label: string; notices: Notice[]; style?: { marginTop: number } }) {
  if (notices.length === 0) return null;
  return (
    <>
      <Label style={style}>{label}</Label>
      {notices.map((n, i) => (
        <NotifRow key={n.key} first={i === 0} icon={n.icon} tile={n.tile} title={n.title} time={n.time} />
      ))}
    </>
  );
}

export default function Notifications() {
  const router = useRouter();

  const state = useAsync(async () => {
    const [activity, vouchers] = await Promise.all([getActivity(40), getVouchers()]);
    return { activity, vouchers };
  }, []);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  const now = new Date();
  const soon = state.data ? expiringSoon(state.data.vouchers, now) : [];
  const past = (state.data?.activity ?? [])
    .map((e) => eventNotice(e, now))
    .filter((n): n is Notice => n !== null)
    .slice(0, 20);
  const today = past.filter((n) => n.at.toDateString() === now.toDateString());
  const earlier = past.filter((n) => n.at.toDateString() !== now.toDateString());
  const empty = soon.length === 0 && past.length === 0;

  return (
    <Screen background={C.surface} bottomGap={40} refreshing={state.refreshing} onRefresh={state.refresh}>
      <View style={{ marginTop: 2 }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
      </View>

      <View style={{ marginTop: 20 }}>
        <H1 style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>Notifications</H1>
      </View>

      {state.loading ? (
        <Loading />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={state.refresh} />
      ) : empty ? (
        <EmptyState
          title="Nothing to tell you yet"
          body="Points landing, rewards you can use and anything about to expire will show up here."
          actionLabel="Browse brands"
          onAction={() => router.push('/discover')}
        />
      ) : (
        <View style={{ marginTop: 22 }}>
          <Group label="Soon" notices={soon} />
          <Group label="Today" notices={today} style={soon.length ? { marginTop: 22 } : undefined} />
          <Group
            label="Earlier"
            notices={earlier}
            style={soon.length || today.length ? { marginTop: 22 } : undefined}
          />
        </View>
      )}
    </Screen>
  );
}
