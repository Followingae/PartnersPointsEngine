import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { OnColorBar, brandColor, brandFg, brandTint } from '@/components/BrandCard';
import { Body, ErrorState, H1, IconButton, Label, Loading, Screen, pts } from '@/components/UI';
import { getCards, getProgram, type ProgramTier } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, font } from '@/lib/tokens';

/** 14 · Tiers — where the customer stands and what the ladder holds. */

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

function LockIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={5} y={10} width={14} height={10} rx={2} />
      <Path d="M8 10V8a4 4 0 0 1 8 0v2" />
    </Svg>
  );
}

function Perk({ text, dot }: { text: string; dot: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: dot }} />
      <Text style={{ fontFamily: font(500), fontSize: 13.5, lineHeight: 19, color: C.muted }}>{text}</Text>
    </View>
  );
}

/**
 * Benefits are free-form JSON the brand console writes, so take only what can
 * actually be rendered: a list of strings, or a map of them.
 */
function perksOf(benefits: Record<string, unknown>): string[] {
  const raw = (benefits as { perks?: unknown })?.perks ?? benefits;
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (raw && typeof raw === 'object') {
    return Object.values(raw as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
  }
  return [];
}

/** A tier with a multiplier but no written perks still has something to say. */
function fallbackPerk(t: ProgramTier): string[] {
  if (t.multiplierBps && t.multiplierBps !== 10000) {
    const x = t.multiplierBps / 10000;
    return [`Earn ${x % 1 === 0 ? x : x.toFixed(1)}× points`];
  }
  return [];
}

export default function Tiers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brandId = Array.isArray(id) ? id[0]! : id!;

  const state = useAsync(async () => {
    const [cards, program] = await Promise.all([getCards(), getProgram(brandId)]);
    return { card: cards.find((c) => c.brandId === brandId) ?? null, program };
  }, [brandId]);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  const card = state.data?.card;
  const program = state.data?.program;
  const color = card ? brandColor(card.brandId, card.branding) : C.ink;
  const fg = brandFg(color);

  return (
    <Screen background={C.surface} bottomGap={40} refreshing={state.refreshing} onRefresh={state.refresh}>
      <View style={{ marginTop: 2 }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
      </View>

      {state.loading ? (
        <Loading />
      ) : state.error || !program ? (
        <ErrorState message={state.error ?? 'Could not load this programme'} onRetry={state.refresh} />
      ) : (
        <>
          <View style={{ marginTop: 20 }}>
            <H1 style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.75 }}>Tiers</H1>
            <Body tone="muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 20 }}>{program.brandName}</Body>
          </View>

          {program.tiers.length === 0 ? (
            <Body tone="muted" style={{ marginTop: 24 }}>
              {program.brandName} doesn’t run tiers — every point is worth the same here.
            </Body>
          ) : (
            <>
              {card ? (
                <View style={{ marginTop: 22, borderRadius: 26, backgroundColor: color, paddingVertical: 22, paddingHorizontal: 24 }}>
                  <Text style={{ fontFamily: font(600), fontSize: 30, lineHeight: 35, letterSpacing: -0.9, color: fg }}>
                    {card.tier ?? 'Member'}
                  </Text>
                  <View style={{ marginTop: 20 }}>
                    <OnColorBar value={(card.progressPct ?? 0) / 100} color={color} />
                  </View>
                  <Text style={{ marginTop: 12, fontFamily: font(500), fontSize: 13.5, lineHeight: 19, color: fg }}>
                    {card.nextTier && card.nextTierThreshold
                      ? `${pts(Number(card.lifetime))} of ${pts(Number(card.nextTierThreshold))} to ${card.nextTier}`
                      : `${pts(Number(card.lifetime))} lifetime points`}
                  </Text>
                </View>
              ) : null}

              <View style={{ marginTop: 24 }}>
                <Label>The ladder</Label>

                <View style={{ marginTop: 6 }}>
                  {program.tiers.map((t) => {
                    const current = t.current;
                    const locked = !t.reached;
                    const dot = current ? color : locked ? C.soft : C.greenDeep;
                    const perks = perksOf(t.benefits);
                    const shown = perks.length ? perks : fallbackPerk(t);
                    return (
                      <View
                        key={t.id}
                        style={
                          current
                            ? { marginVertical: 6, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18, backgroundColor: brandTint(color, 0.08) }
                            : { paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(21,21,15,.08)' }
                        }
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                            <Text style={{ fontFamily: font(600), fontSize: current ? 18 : 16, lineHeight: current ? 24 : 22, letterSpacing: -0.27, color: C.ink }}>
                              {t.name}
                            </Text>
                            {current ? (
                              <View style={{ backgroundColor: color, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                                <Text style={{ fontFamily: font(600), fontSize: 10.5, lineHeight: 15, letterSpacing: 1.05, textTransform: 'uppercase', color: fg }}>
                                  Now
                                </Text>
                              </View>
                            ) : null}
                            {locked ? <LockIcon /> : null}
                          </View>
                          <Text style={{ fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.soft }}>
                            {pts(Number(t.threshold))}+
                          </Text>
                        </View>

                        {shown.length ? (
                          <View style={{ marginTop: 8, gap: 5 }}>
                            {shown.map((p) => <Perk key={p} text={p} dot={dot} />)}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
