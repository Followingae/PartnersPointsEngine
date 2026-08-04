import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { brandColor, brandScrim } from '@/components/BrandCard';
import { SheetShell } from '@/components/SheetShell';
import {Body, Button, ErrorState, H2, Loading, Small, money, pts} from '@/components/UI';
import { getCards, getProgram, type Program } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, SP, font } from '@/lib/tokens';

/**
 * 15 · How you earn — a sheet over the dimmed card detail.
 *
 * Everything on it comes from `GET /customer/program`, which is deliberately
 * narrow: the brand's earn rules by *name* only. The rule definitions are the
 * engine's business, not the customer's, so this screen never invents the "1 pt
 * per AED" line the design mocked — it shows the rules the brand actually named,
 * then the two things that change what a visit is worth: the member's tier
 * multiplier, and what points convert to at the till.
 */

const stroke = { fill: 'none', stroke: C.ink, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function PlusIcon() {
  return <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}><Path d="M12 5v14M5 12h14" /></Svg>;
}
function StarIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}>
      <Path d="M12 4l2.3 4.9 5.2.6-3.8 3.6 1 5.3L12 15.8 7.3 18.4l1-5.3L4.5 9.5l5.2-.6z" />
    </Svg>
  );
}
function GiftIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}>
      <Path d="M4 11h16v9H4zM4 7h16v4H4zM12 7v13M8.5 7a2.5 2.5 0 1 1 3.5-2.4M15.5 7a2.5 2.5 0 1 0-3.5-2.4" />
    </Svg>
  );
}

function EarnRow({ icon, tile, title, sub, first }: {
  icon: ReactNode; tile: string; title: string; sub?: string; first?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
        borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: tile, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>{title}</Text>
        {sub ? <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>{sub}</Small> : null}
      </View>
    </View>
  );
}

/** "1.5×" rather than "1.5000×" — trailing zeroes read as precision that isn't there. */
function multiplier(bps: number): string {
  const x = bps / 10000;
  return x % 1 === 0 ? `${x}×` : `${x.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
}

/** What points convert to at the till, when the brand has configured a rate. */
function worthLine(p: Program): { title: string; sub?: string } | null {
  const r = p.redemption;
  if (!r || r.configured === false || !r.ratePoints || !r.rateValueMinor) return null;
  const points = Number(r.ratePoints);
  const value = Number(r.rateValueMinor);
  if (!Number.isFinite(points) || !Number.isFinite(value) || points <= 0 || value <= 0) return null;
  return {
    title: `${pts(points)} ${p.pointsCode} = ${money(value, p.currency)}`,
    sub: r.minRedeemPoints && Number(r.minRedeemPoints) > 0
      ? `Spend from ${pts(Number(r.minRedeemPoints))} ${p.pointsCode}`
      : 'What your points come off the bill as',
  };
}

export default function HowYouEarn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brandId = Array.isArray(id) ? id[0]! : id!;
  const router = useRouter();

  const state = useAsync(async () => {
    const [cards, program] = await Promise.all([getCards(), getProgram(brandId)]);
    return { card: cards.find((c) => c.brandId === brandId) ?? null, program };
  }, [brandId]);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  const { card, program } = state.data ?? {};
  // The scrim is the dimmed card behind the sheet, so it must be that card's
  // own colour — falling back to ink while the wallet is still loading.
  const backdrop = brandScrim(card ? brandColor(card.brandId, card.branding) : C.ink);

  const tier = program?.tiers.find((t) => t.current);
  const boost = tier && tier.multiplierBps && tier.multiplierBps !== 10000 ? tier : null;
  const worth = program ? worthLine(program) : null;
  const rules = program?.earnRules ?? [];
  const nothingToSay = Boolean(program) && rules.length === 0 && !boost && !worth;

  return (
    <SheetShell backdrop={backdrop} onDismiss={() => router.back()}>
        <H2 style={{ marginTop: 22, fontSize: 26, lineHeight: 32, letterSpacing: -0.65 }}>How you earn</H2>

        {state.loading ? (
          <Loading />
        ) : state.error || !program ? (
          <ErrorState message={state.error ?? 'Could not load this programme'} onRetry={state.refresh} />
        ) : nothingToSay ? (
          <Body tone="muted" style={{ marginTop: 14, fontSize: 14, lineHeight: 20 }}>
            {program.brandName} hasn’t published how its points are earned yet. Points still land on
            every visit — show your code at the till.
          </Body>
        ) : (
          <View style={{ marginTop: 22 }}>
            {rules.map((r, i) => (
              <EarnRow
                key={`${r.name}-${i}`}
                first={i === 0}
                icon={<PlusIcon />}
                tile="rgba(0,179,126,.14)"
                title={r.name}
                sub="Applied automatically at the till"
              />
            ))}

            {boost ? (
              <EarnRow
                first={rules.length === 0}
                icon={<StarIcon />}
                tile={C.wash}
                title={`${boost.name} — ${multiplier(boost.multiplierBps)} points`}
                sub="Your tier multiplies every earn while you hold it"
              />
            ) : null}

            {worth ? (
              <EarnRow
                first={rules.length === 0 && !boost}
                icon={<GiftIcon />}
                tile="rgba(255,31,107,.12)"
                title={worth.title}
                sub={worth.sub}
              />
            ) : null}
          </View>
        )}

        <Button label="Got it" onPress={() => router.back()} style={{ marginTop: 26, height: 58, borderRadius: 18 }} />
      </SheetShell>
  );
}
