import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { H1, IconButton, Label, Screen, Small } from '@/components/UI';
import { C, font } from '@/lib/tokens';

/** 12 · Notifications — the account-wide feed. */

const stroke = { fill: 'none', stroke: C.ink, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function BackIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" {...stroke}><Path d="M15 5l-7 7 7 7" /></Svg>;
}
function PlusIcon() {
  return <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}><Path d="M12 5v14M5 12h14" /></Svg>;
}
function CupIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}>
      <Path d="M5 6h11v6a5.5 5.5 0 0 1-11 0z" />
      <Path d="M16 8h2.5a2.5 2.5 0 0 1 0 5H16M4 20h13" />
    </Svg>
  );
}
function AlertIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}>
      <Path d="M12 4.5l8.5 15H3.5z" />
      <Path d="M12 10v4M12 17h.01" />
    </Svg>
  );
}
function ConvertIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" {...stroke}>
      <Path d="M17 4v6h-6M7 20v-6h6" />
      <Path d="M19 10a7 7 0 0 0-13-2M5 14a7 7 0 0 0 13 2" />
    </Svg>
  );
}

function NotifRow({ icon, tile, title, time, first }: {
  icon: ReactNode; tile: string; title: string; time: string; first?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
        borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
      }}
    >
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: tile, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, color: C.ink }}>{title}</Text>
        <Small style={{ marginTop: 3, fontSize: 12.5 }}>{time}</Small>
      </View>
    </View>
  );
}

export default function Notifications() {
  const router = useRouter();

  return (
    <Screen background={C.surface} bottomGap={40}>
      <View style={{ marginTop: 2 }}>
        <IconButton onPress={() => router.back()} style={{ borderRadius: 999 }}>
          <BackIcon />
        </IconButton>
      </View>

      <View style={{ marginTop: 20 }}>
        <H1 style={{ fontSize: 30, letterSpacing: -0.75 }}>Notifications</H1>
      </View>

      {/* TODO(api): notification feed, grouped by day. */}
      <View style={{ marginTop: 22 }}>
        <Label>Today</Label>
        <NotifRow first icon={<PlusIcon />} tile="rgba(0,179,126,.14)" title="+120 pts at Camel Bean" time="2:41 PM" />
        <NotifRow icon={<CupIcon />} tile={C.wash} title="Free flat white unlocked" time="9:12 AM" />

        <Label style={{ marginTop: 22 }}>Earlier</Label>
        <NotifRow icon={<AlertIcon />} tile="rgba(255,171,61,.18)" title="90 pts at Núr expire 30 Jul" time="Yesterday" />
        <NotifRow icon={<ConvertIcon />} tile={C.wash} title="Lulu transfer complete" time="Sat" />
      </View>
    </Screen>
  );
}
