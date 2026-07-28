import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { H1, Screen, Small } from '@/components/UI';
import { C, R, font } from '@/lib/tokens';
import { IconName, ListRow, TopBar } from '@/components/RewardKit';

type Status = 'active' | 'used' | 'expired';

const FILTERS: { key: Status; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'used', label: 'Used' },
  { key: 'expired', label: 'Expired' },
];

const VOUCHERS: {
  id: string; title: string; sub: string; icon: IconName; iconBg: string; status: Status;
}[] = [
  { id: 'cb-9k2d-4417', title: 'Free flat white', sub: 'Camel Bean · expires 11 Aug', icon: 'cup', iconBg: 'rgba(255,74,28,.12)', status: 'active' },
  { id: 'nur-slice', title: 'Free slice', sub: 'Núr · expires 2 Aug', icon: 'gift', iconBg: 'rgba(123,47,247,.12)', status: 'active' },
  { id: 'verde-10', title: 'AED 10 off', sub: 'Verde · expires 30 Jul', icon: 'tag', iconBg: 'rgba(0,179,126,.14)', status: 'active' },
];

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
  const [filter, setFilter] = useState<Status>('active');

  // TODO(api): list the customer's vouchers; sample rows come from the design.
  const rows = VOUCHERS.filter((v) => v.status === filter);

  return (
    <Screen background={C.surface} bottomGap={30}>
      <TopBar />

      <H1 style={{ marginTop: 20 }}>Vouchers</H1>

      <View style={{ marginTop: 22, flexDirection: 'row', gap: 8 }}>
        {FILTERS.map((f) => (
          <Filter key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>

      <View style={{ marginTop: 24 }}>
        {rows.map((v, i) => (
          <ListRow
            key={v.id}
            icon={v.icon}
            iconBg={v.iconBg}
            title={v.title}
            sub={v.sub}
            chevron
            divider={i > 0}
            onPress={() => router.push(`/voucher/${v.id}`)}
          />
        ))}
        {rows.length === 0 ? (
          <Small style={{ paddingVertical: 24 }}>Nothing here yet.</Small>
        ) : null}
      </View>
    </Screen>
  );
}
