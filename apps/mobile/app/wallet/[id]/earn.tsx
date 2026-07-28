import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { brandScrim, getBrand } from '@/components/BrandCard';
import { Button, H2, Screen, Small } from '@/components/UI';
import { C, SP, font } from '@/lib/tokens';

/** 15 · How you earn — a sheet over the dimmed card detail. */

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
  icon: ReactNode; tile: string; title: string; sub: string; first?: boolean;
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
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, color: C.ink }}>{title}</Text>
        <Small style={{ marginTop: 3, fontSize: 12.5 }}>{sub}</Small>
      </View>
    </View>
  );
}

/** Grabber + white sheet anchored to the bottom of the dimmed backdrop. */
function SheetShell({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={{ flex: 1 }} onPress={onDismiss} />
      <View
        style={{
          backgroundColor: C.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30,
          paddingTop: 14, paddingHorizontal: SP.gutter, paddingBottom: 32,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: 'rgba(21,21,15,.08)' }} />
        </View>
        {children}
      </View>
    </View>
  );
}

export default function HowYouEarn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brand = getBrand(id);

  return (
    <Screen background={brandScrim(brand.color)} scroll={false} pad={false} bottomGap={0}>
      <SheetShell onDismiss={() => router.back()}>
        <H2 style={{ marginTop: 22, fontSize: 26, letterSpacing: -0.65 }}>How you earn</H2>

        {/* TODO(api): the brand's live earn rules. */}
        <View style={{ marginTop: 22 }}>
          <EarnRow first icon={<PlusIcon />} tile="rgba(0,179,126,.14)" title="Every purchase" sub="1 pt per AED, in store and online" />
          <EarnRow icon={<StarIcon />} tile={C.wash} title="Thursdays 4–6pm" sub="Double points, no cap" />
          <EarnRow icon={<GiftIcon />} tile="rgba(255,31,107,.12)" title="Your birthday" sub="+50 pts and a free drink" />
        </View>

        <Button label="Got it" onPress={() => router.back()} style={{ marginTop: 26, height: 58, borderRadius: 18 }} />
      </SheetShell>
    </Screen>
  );
}
