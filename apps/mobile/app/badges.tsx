import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { BackBar, Icon } from '@/components/Bits';
import { Chip, EmptyState, ErrorState, H1, Loading, Screen, Small } from '@/components/UI';
import { getBadges, getCards, type BadgeAward } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, SP, font } from '@/lib/tokens';
import { badgeColor, badgeGlyph } from '@/app/badges/_data';

const COLUMNS = 3;

/**
 * A badge's icon is whatever the brand typed — usually an emoji. Anything we
 * can't draw falls back to the trophy the design uses.
 */
function BadgeGlyph({ icon, color, size }: { icon: string | null; color: string; size: number }) {
  const glyph = badgeGlyph(color);
  if (icon && icon.trim()) {
    return <Text style={{ fontSize: size, lineHeight: size * 1.2 }}>{icon.trim()}</Text>;
  }
  return <Icon name="trophy" size={size} color={glyph} weight={1.6} />;
}

function BadgeTile({ award, onPress }: { award: BadgeAward; onPress: () => void }) {
  const color = badgeColor(award.badge.name);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.8 } : null]}>
      <View
        style={{
          aspectRatio: 1,
          borderRadius: 22,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BadgeGlyph icon={award.badge.icon} color={color} size={32} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          marginTop: 10,
          textAlign: 'center',
          fontFamily: font(600),
          fontSize: 12, lineHeight: 17,
          color: C.ink,
        }}
      >
        {award.badge.name}
      </Text>
    </Pressable>
  );
}

export default function Badges() {
  const router = useRouter();
  const [brandId, setBrandId] = useState<string | null>(null);

  // Badges are awarded per brand, so the wall is always the wall of one card.
  const cards = useAsync(getCards);
  const brands = cards.data ?? [];
  const active = brandId ?? brands[0]?.brandId ?? null;
  const activeName = brands.find((b) => b.brandId === active)?.brandName;

  const badges = useAsync(
    () => (active ? getBadges(active) : Promise.resolve([])),
    [active],
  );

  useEffect(() => {
    if (cards.signedOut || badges.signedOut) router.replace('/onboarding/phone');
  }, [cards.signedOut, badges.signedOut, router]);

  const refresh = () => {
    cards.refresh();
    badges.refresh();
  };

  const awards = badges.data ?? [];
  const rows: BadgeAward[][] = [];
  for (let i = 0; i < awards.length; i += COLUMNS) rows.push(awards.slice(i, i + COLUMNS));

  const loading = cards.loading || (Boolean(active) && badges.loading);
  const error = cards.error ?? badges.error;

  return (
    <Screen refreshing={cards.refreshing || badges.refreshing} onRefresh={refresh}>
      <BackBar fallback="/home" />
      <View style={{ marginTop: 20 }}>
        <H1>Badges</H1>
        {active && !loading ? (
          <Small style={{ marginTop: 8, fontSize: 14, lineHeight: 20 }}>
            {awards.length === 1 ? '1 earned' : `${awards.length} earned`}
            {activeName ? ` at ${activeName}` : ''}
          </Small>
        ) : null}
      </View>

      {/* One card per chip — badges have no meaning across brands. */}
      {brands.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.tight, marginTop: 16 }}>
          {brands.map((b) => (
            <Pressable key={b.brandId} onPress={() => setBrandId(b.brandId)}>
              <Chip
                label={b.brandName}
                tone={b.brandId === active ? 'ink' : 'neutral'}
                style={{ paddingHorizontal: 15, paddingVertical: 9 }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading ? (
        <Loading />
      ) : error && awards.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !active ? (
        <EmptyState
          title="No cards yet"
          body="Join a brand and its badges show up here."
          actionLabel="Find a brand"
          onAction={() => router.push('/discover')}
        />
      ) : awards.length === 0 ? (
        <EmptyState
          title="No badges yet"
          body={`Keep earning at ${activeName ?? 'this brand'} and they unlock here.`}
        />
      ) : (
        <View style={{ marginTop: SP.gutter, gap: SP.gap }}>
          {rows.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: SP.gap }}>
              {row.map((a) => (
                <BadgeTile
                  key={a.badge.name}
                  award={a}
                  onPress={() => router.push(`/badges/${encodeURIComponent(a.badge.name)}?brandId=${active}`)}
                />
              ))}
              {/* keep a short last row on the same 3-column rhythm */}
              {Array.from({ length: COLUMNS - row.length }, (_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
