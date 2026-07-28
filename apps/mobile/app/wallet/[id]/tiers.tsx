import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { OnColorBar, brandFg, brandTint, getBrand } from '@/components/BrandCard';
import { Body, H1, IconButton, Label, Screen, pts } from '@/components/UI';
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

type Rung = { name: string; threshold: string; perks: string[]; state: 'passed' | 'current' | 'locked' };

// TODO(api): GET /me/cards/:id/tiers — the brand's own ladder and the customer's place on it.
const LADDER: Rung[] = [
  { name: 'Green', threshold: '0+', perks: ['Welcome reward', 'Birthday reward'], state: 'passed' },
  { name: 'Silver', threshold: '1,000+', perks: ['Free size upgrades', 'Offers a day early'], state: 'passed' },
  { name: 'Gold', threshold: '2,000+', perks: ['Double points on Thursdays', 'A free drink every month'], state: 'current' },
  { name: 'Black', threshold: '2,800+', perks: ['Guest passes', 'Seasonal blend reserve'], state: 'locked' },
];

function Perk({ text, dot }: { text: string; dot: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: dot }} />
      <Text style={{ fontFamily: font(500), fontSize: 13.5, color: C.muted }}>{text}</Text>
    </View>
  );
}

export default function Tiers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brand = getBrand(id);
  const fg = brandFg(brand.color);
  const next = 2800;

  return (
    <Screen background={C.surface} bottomGap={40}>
      <View style={{ marginTop: 2 }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
      </View>

      <View style={{ marginTop: 20 }}>
        <H1 style={{ fontSize: 30, letterSpacing: -0.75 }}>Tiers</H1>
        <Body tone="muted" style={{ marginTop: 8, fontSize: 14 }}>{brand.name}</Body>
      </View>

      <View style={{ marginTop: 22, borderRadius: 26, backgroundColor: brand.color, paddingVertical: 22, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: font(600), fontSize: 30, letterSpacing: -0.9, color: fg }}>{brand.tier}</Text>
          {/* TODO(api): tier anniversary date. */}
          <Text style={{ fontFamily: font(500), fontSize: 13, color: fg }}>since Mar 2025</Text>
        </View>
        <View style={{ marginTop: 20 }}>
          <OnColorBar value={brand.progress ?? 0} color={brand.color} />
        </View>
        <Text style={{ marginTop: 12, fontFamily: font(500), fontSize: 13.5, color: fg }}>
          {brand.footnote} · {pts(brand.points)} of {pts(next)}
        </Text>
      </View>

      <View style={{ marginTop: 24 }}>
        <Label>The ladder</Label>

        <View style={{ marginTop: 6 }}>
          {LADDER.map((rung) => {
            const current = rung.state === 'current';
            const dot = current ? brand.color : rung.state === 'locked' ? C.soft : C.greenDeep;
            return (
              <View
                key={rung.name}
                style={
                  current
                    ? { marginVertical: 6, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18, backgroundColor: brandTint(brand.color, 0.08) }
                    : { paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(21,21,15,.08)' }
                }
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                    <Text style={{ fontFamily: font(600), fontSize: current ? 18 : 16, letterSpacing: -0.27, color: C.ink }}>
                      {rung.name}
                    </Text>
                    {current ? (
                      <View style={{ backgroundColor: brand.color, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                        <Text style={{ fontFamily: font(600), fontSize: 10.5, letterSpacing: 1.05, textTransform: 'uppercase', color: fg }}>
                          Now
                        </Text>
                      </View>
                    ) : null}
                    {rung.state === 'locked' ? <LockIcon /> : null}
                  </View>
                  <Text style={{ fontFamily: font(500), fontSize: 12.5, color: C.soft }}>{rung.threshold}</Text>
                </View>

                <View style={{ marginTop: 8, gap: 5 }}>
                  {rung.perks.map((p) => <Perk key={p} text={p} dot={dot} />)}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
