import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { OnColorBar, brandFg, getBrand } from '@/components/BrandCard';
import { IconButton, Label, Screen, Small, pts } from '@/components/UI';
import { C, R, S, SP, font } from '@/lib/tokens';

/** 13 · Card detail — brand-coloured head over a white sheet. */

function BackIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={5} cy={12} r={1} />
      <Circle cx={12} cy={12} r={1} />
      <Circle cx={19} cy={12} r={1} />
    </Svg>
  );
}

const act = (color: string) => ({ fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const);

function QrIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" {...act(color)}>
      <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <Path d="M4 12h16" />
    </Svg>
  );
}
function RewardsIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" {...act(color)}>
      <Path d="M12 3l9 9-9 9-9-9z" />
      <Circle cx={12} cy={9} r={1.4} />
    </Svg>
  );
}
function ConvertIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" {...act(color)}>
      <Path d="M17 4v6h-6M7 20v-6h6" />
      <Path d="M19 10a7 7 0 0 0-13-2M5 14a7 7 0 0 0 13 2" />
    </Svg>
  );
}
function WalletIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" {...act(color)}>
      <Rect x={3} y={6} width={18} height={13} rx={3} />
      <Path d="M16 12h3" />
    </Svg>
  );
}

function Action({ label, icon, primary, onPress }: {
  label: string; icon: (color: string) => ReactNode; primary?: boolean; onPress?: () => void;
}) {
  const fg = primary ? '#fff' : C.ink;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 6,
        alignItems: 'center', gap: 9,
        backgroundColor: primary ? C.ink : C.wash,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon(fg)}
      <Text style={{ fontFamily: font(600), fontSize: 11.5, lineHeight: 16, color: fg }}>{label}</Text>
    </Pressable>
  );
}

function RecentRow({ title, when, amount, color, first }: {
  title: string; when: string; amount: string; color: string; first?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
        borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{title}</Text>
        <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{when}</Small>
      </View>
      <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color }}>{amount}</Text>
    </View>
  );
}

export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // TODO(api): GET /me/cards/:id — balance, tier, recent ledger entries.
  const brand = getBrand(id);
  const fg = brandFg(brand.color);
  const chrome = fg === '#fff' ? 'rgba(255,255,255,.18)' : 'rgba(21,21,15,.15)';
  const base = `/wallet/${brand.id}`;

  return (
    <Screen background={brand.color} pad={false} bottomGap={0}>
      <View style={{ paddingHorizontal: SP.gutter }}>
        <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton onPress={() => router.back()} style={{ borderRadius: 999, backgroundColor: chrome }}>
            <BackIcon color={fg} />
          </IconButton>
          <IconButton onPress={() => router.push(`${base}/notifications`)} style={{ borderRadius: 999, backgroundColor: chrome }}>
            <MoreIcon color={fg} />
          </IconButton>
        </View>

        <View style={{ marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <View
            style={{
              width: 52, height: 52, borderRadius: 16, backgroundColor: chrome,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: font(600), fontSize: 17, lineHeight: 24, color: fg }}>{brand.initial}</Text>
          </View>
          <View>
            <Text style={{ fontFamily: font(600), fontSize: 19, lineHeight: 23, letterSpacing: -0.38, color: fg }}>{brand.name}</Text>
            <Text style={{ marginTop: 3, fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: fg }}>{brand.category}</Text>
          </View>
        </View>

        <View style={{ marginTop: 34, flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
          <Text style={{ fontFamily: font(600), fontSize: 60, lineHeight: 69, letterSpacing: -2.4, color: fg }}>
            {pts(brand.points)}
          </Text>
          <Text style={{ fontFamily: font(500), fontSize: 15, lineHeight: 21, color: fg }}>pts</Text>
        </View>

        <Pressable onPress={() => router.push(`${base}/tiers`)}>
          <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: font(500), fontSize: 13.5, lineHeight: 19, color: fg }}>{brand.tier}</Text>
            <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: fg }}>{brand.footnote}</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <OnColorBar value={brand.progress ?? 0} color={brand.color} />
          </View>
        </Pressable>
      </View>

      <View
        style={{
          marginTop: 30, paddingTop: 26, paddingBottom: 40, minHeight: 440,
          backgroundColor: C.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: SP.gutter }}>
          <Action label="Show QR" primary icon={(c) => <QrIcon color={c} />} onPress={() => router.push('/(tabs)/scan')} />
          <Action label="Rewards" icon={(c) => <RewardsIcon color={c} />} onPress={() => router.push('/rewards')} />
          <Action label="Convert" icon={(c) => <ConvertIcon color={c} />} onPress={() => router.push('/convert')} />
          {/* TODO(api): add-to-Apple/Google-Wallet pass issuance. */}
          <Action label="Wallet" icon={(c) => <WalletIcon color={c} />} />
        </View>

        <View style={{ paddingHorizontal: SP.gutter, paddingTop: 30 }}>
          <Pressable
            onPress={() => router.push(`${base}/activity`)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Label>Recent</Label>
            <Text style={{ fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: C.muted }}>All</Text>
          </Pressable>

          <RecentRow first title="Earned · JLT branch" when="Today · 2:41 PM" amount="+120" color={S.earnInk} />
          <RecentRow title="Redeemed · free flat white" when="Mon · 8:40 AM" amount="−450" color={S.spend} />
          <RecentRow title="Converted to Lulu" when="Sat · 2:40 PM" amount="−1,000" color={C.electric} />
        </View>

        <View style={{ paddingHorizontal: SP.gutter, paddingTop: 8, flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => router.push(`${base}/earn`)}
            style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: R.chip, backgroundColor: C.wash }}
          >
            <Text style={{ fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: C.ink }}>How you earn</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`${base}/expiring`)}
            style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: R.chip, backgroundColor: C.wash }}
          >
            <Text style={{ fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: C.ink }}>Expiring points</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
