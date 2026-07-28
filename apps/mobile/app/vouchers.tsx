import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState, ErrorState, H1, Loading, Screen } from '@/components/UI';
import { C, R, font } from '@/lib/tokens';
import { IconName, ListRow, TopBar } from '@/components/RewardKit';
import { getVouchers, type Voucher, type VoucherStatus } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { shortDate } from '@/lib/dates';
import { brandColor, brandTint } from '@/components/BrandCard';

type Tab = 'active' | 'used' | 'expired';

const FILTERS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'used', label: 'Used' },
  { key: 'expired', label: 'Expired' },
];

/** A reserved voucher is mid-sale, so it belongs with the ones still spendable. */
const STATUSES: Record<Tab, VoucherStatus[]> = {
  active: ['issued', 'reserved'],
  used: ['redeemed'],
  expired: ['expired', 'void'],
};

const EMPTY: Record<Tab, { title: string; body: string }> = {
  active: { title: 'No vouchers yet', body: 'Rewards you claim will appear here, ready for the till.' },
  used: { title: 'Nothing used yet', body: 'Vouchers you redeem will be kept here.' },
  expired: { title: 'Nothing expired', body: 'Vouchers that run out of time will be listed here.' },
};

/** What this voucher is doing right now — the line a customer reads first. */
function statusLine(v: Voucher): string {
  switch (v.status) {
    case 'reserved':
      return 'In use at the till';
    case 'redeemed':
      return v.redeemedAt ? `Used ${shortDate(v.redeemedAt)}` : 'Used';
    case 'expired':
      return v.expiresAt ? `Expired ${shortDate(v.expiresAt)}` : 'Expired';
    case 'void':
      return 'Cancelled';
    default:
      return v.expiresAt ? `Expires ${shortDate(v.expiresAt)}` : 'No expiry';
  }
}

function icon(v: Voucher): IconName {
  if (v.status === 'reserved') return 'swap';
  if (v.status === 'redeemed') return 'check';
  if (v.status === 'expired' || v.status === 'void') return 'alert';
  // Zero points spent means it was a gift, not a purchase.
  return v.pointsSpent === '0' ? 'gift' : 'tag';
}

function iconColors(v: Voucher): { bg: string; fg: string } {
  if (v.status === 'reserved') return { bg: brandTint(C.orange, 0.14), fg: C.orange };
  if (v.status === 'expired' || v.status === 'void') return { bg: C.canvas, fg: C.faint };
  return { bg: brandTint(brandColor(v.brandId, v.branding), 0.14), fg: C.ink };
}

function Filter({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: 9,
          paddingHorizontal: 15,
          borderRadius: R.chip,
          backgroundColor: selected ? C.ink : C.canvas,
        },
        pressed ? { opacity: 0.8 } : null,
      ]}
    >
      <Text style={{
        fontFamily: font(selected ? 600 : 500),
        fontSize: 12.5, lineHeight: 18,
        color: selected ? '#fff' : C.ink,
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Vouchers() {
  const router = useRouter();
  const [filter, setFilter] = useState<Tab>('active');
  const { data, loading, refreshing, error, signedOut, refresh } = useAsync(() => getVouchers(), []);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const rows = (data ?? []).filter((v) => STATUSES[filter].includes(v.status));

  return (
    <Screen background={C.surface} bottomGap={30} refreshing={refreshing} onRefresh={refresh}>
      <TopBar />

      <H1 style={{ marginTop: 20 }}>Vouchers</H1>

      <View style={{ marginTop: 22, flexDirection: 'row', gap: 8 }}>
        {FILTERS.map((f) => (
          <Filter key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>

      <View style={{ marginTop: 24 }}>
        {loading ? <Loading /> : null}

        {!loading && error ? <ErrorState message={error} onRetry={refresh} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title={EMPTY[filter].title}
            body={EMPTY[filter].body}
            actionLabel={filter === 'active' ? 'Browse rewards' : undefined}
            onAction={filter === 'active' ? () => router.push('/rewards') : undefined}
          />
        ) : null}

        {rows.map((v, i) => {
          const { bg, fg } = iconColors(v);
          return (
            <ListRow
              key={v.id}
              icon={icon(v)}
              iconBg={bg}
              iconColor={fg}
              title={v.rewardName}
              sub={[v.brandName, statusLine(v)].filter(Boolean).join(' · ')}
              chevron
              divider={i > 0}
              onPress={() => router.push(`/voucher/${encodeURIComponent(v.id)}`)}
            />
          );
        })}
      </View>
    </Screen>
  );
}
