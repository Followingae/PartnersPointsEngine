import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { OnColorBar, brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { EmptyState, ErrorState, IconButton, Label, Loading, Screen, Small, pts } from '@/components/UI';
import { getActivity, getCards } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
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

/** "Today · 2:41 PM" for today, "12 Jul · 8:40 AM" before that. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Today · ${time}`;
  return `${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} · ${time}`;
}

/** Loading, failure and not-found all still need a way back. */
function Fallback({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <Screen background={C.surface}>
      <View style={{ marginTop: 2 }}>
        <IconButton onPress={onBack} style={{ borderRadius: 999 }}>
          <BackIcon color={C.ink} />
        </IconButton>
      </View>
      {children}
    </Screen>
  );
}

export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brandId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const { data: cards, loading, refreshing, error, signedOut, refresh } = useAsync(getCards, []);
  // Kept separate from the card fetch: a failed activity read should cost the
  // preview list, not the balance the customer came here for.
  const activity = useAsync(() => getActivity(40), []);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const card = cards?.find((c) => c.brandId === brandId);

  if (loading) return <Fallback onBack={() => router.back()}><Loading /></Fallback>;

  if (error && !cards) {
    return (
      <Fallback onBack={() => router.back()}>
        <ErrorState message={error} onRetry={refresh} />
      </Fallback>
    );
  }

  if (!card) {
    return (
      <Fallback onBack={() => router.back()}>
        <EmptyState
          title="Card not found"
          body="This card isn’t in your wallet."
          actionLabel="Browse brands"
          onAction={() => router.push('/discover')}
        />
      </Fallback>
    );
  }

  const color = brandColor(card.brandId, card.branding);
  const fg = brandFg(color);
  const chrome = fg === '#fff' ? 'rgba(255,255,255,.18)' : 'rgba(21,21,15,.15)';
  const base = `/wallet/${card.brandId}`;
  const joined = new Date(card.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const footnote = card.nextTier && card.toNextTier
    ? `${pts(Number(card.toNextTier))} to ${card.nextTier}`
    : null;
  const recent = (activity.data ?? []).filter((e) => e.brandId === card.brandId).slice(0, 3);

  const refreshAll = () => {
    refresh();
    activity.refresh();
  };

  return (
    <Screen
      background={color}
      pad={false}
      bottomGap={0}
      refreshing={refreshing || activity.refreshing}
      onRefresh={refreshAll}
    >
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
            <Text style={{ fontFamily: font(600), fontSize: 17, lineHeight: 24, color: fg }}>{brandInitials(card.brandName)}</Text>
          </View>
          <View>
            <Text style={{ fontFamily: font(600), fontSize: 19, lineHeight: 23, letterSpacing: -0.38, color: fg }}>{card.brandName}</Text>
            <Text style={{ marginTop: 3, fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: fg }}>Member since {joined}</Text>
          </View>
        </View>

        <View style={{ marginTop: 34, flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
          <Text style={{ fontFamily: font(600), fontSize: 60, lineHeight: 69, letterSpacing: -2.4, color: fg }}>
            {pts(Number(card.available))}
          </Text>
          <Text style={{ fontFamily: font(500), fontSize: 15, lineHeight: 21, color: fg }}>pts</Text>
        </View>

        {/* A brand with no tier programme gets no tier line and no empty bar. */}
        {card.tier || card.nextTier ? (
          <Pressable onPress={() => router.push(`${base}/tiers`)}>
            <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: font(500), fontSize: 13.5, lineHeight: 19, color: fg }}>{card.tier ?? ''}</Text>
              {footnote ? (
                <Text style={{ fontFamily: font(500), fontSize: 13, lineHeight: 18, color: fg }}>{footnote}</Text>
              ) : null}
            </View>
            {card.nextTier ? (
              <View style={{ marginTop: 10 }}>
                <OnColorBar value={card.progressPct / 100} color={color} />
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          marginTop: 30, paddingTop: 26, paddingBottom: 40, minHeight: 440,
          backgroundColor: C.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: SP.gutter }}>
          <Action
            label="Show QR"
            primary
            icon={(c) => <QrIcon color={c} />}
            onPress={() => router.push({ pathname: '/(tabs)/scan', params: { brandId: card.brandId } })}
          />
          <Action
            label="Rewards"
            icon={(c) => <RewardsIcon color={c} />}
            onPress={() => router.push({ pathname: '/rewards', params: { brandId: card.brandId } })}
          />
          <Action
            label="Convert"
            icon={(c) => <ConvertIcon color={c} />}
            onPress={() => router.push({ pathname: '/convert', params: { brandId: card.brandId } })}
          />
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

          {recent.map((e, i) => (
            <RecentRow
              key={e.id}
              first={i === 0}
              title={e.title}
              when={whenLabel(e.at)}
              amount={e.points ?? ''}
              color={e.direction === 'credit' ? S.earnInk : e.direction === 'debit' ? S.spend : C.muted}
            />
          ))}
          {recent.length === 0 ? (
            <Small style={{ paddingVertical: 18 }}>
              {activity.loading ? 'Loading…' : 'Nothing on this card yet.'}
            </Small>
          ) : null}
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
