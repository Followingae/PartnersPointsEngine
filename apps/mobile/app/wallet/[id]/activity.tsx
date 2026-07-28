import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getBrand } from '@/components/BrandCard';
import { Body, H1, IconButton, Label, Screen, Small } from '@/components/UI';
import { C, S, font } from '@/lib/tokens';

/** 17 · Brand activity — every ledger entry for one card. */

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

function FilterIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 6h16M7 12h10M10 18h4" />
    </Svg>
  );
}

type Entry = { title: string; when: string; amount: string; color: string };

// TODO(api): GET /me/cards/:id/activity — paginated ledger, grouped by period.
const GROUPS: { label: string; entries: Entry[] }[] = [
  {
    label: 'Today',
    entries: [
      { title: 'Earned · JLT branch', when: 'AED 42.00 · 9:12 AM', amount: '+120', color: S.earnInk },
    ],
  },
  {
    label: 'This week',
    entries: [
      { title: 'Redeemed · Free flat white', when: 'Mon · 8:40 AM', amount: '−450', color: S.spend },
      { title: 'Earned · Al Quoz branch', when: 'AED 68.00 · Sun 6:02 PM', amount: '+68', color: S.earnInk },
      { title: 'Converted to Lulu', when: 'Sat · 2:40 PM', amount: '−1,000', color: C.electric },
    ],
  },
  {
    label: 'July',
    entries: [
      { title: 'Expired', when: '3 Jul', amount: '−40', color: C.soft },
    ],
  },
];

export default function BrandActivity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brand = getBrand(id);

  return (
    <Screen background={C.surface} bottomGap={40}>
      <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
        {/* TODO(api): filter by entry type and date range. */}
        <IconButton onPress={() => router.push('/activity/filters')} style={{ borderRadius: 999 }}>
          <FilterIcon />
        </IconButton>
      </View>

      <View style={{ marginTop: 20 }}>
        <H1 style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>{brand.name}</H1>
        <Body tone="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 20 }}>All activity</Body>
      </View>

      <View style={{ marginTop: 24 }}>
        {GROUPS.map((group, gi) => (
          <View key={group.label}>
            <Label style={gi === 0 ? undefined : { marginTop: 22 }}>{group.label}</Label>
            {group.entries.map((e, i) => (
              <View
                key={e.title}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{e.title}</Text>
                  <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{e.when}</Small>
                </View>
                <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: e.color }}>{e.amount}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}
