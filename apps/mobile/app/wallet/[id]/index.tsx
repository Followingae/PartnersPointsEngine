import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

function QuickAction({
  label,
  primary,
  onPress,
  icon,
}: {
  label: string;
  primary?: boolean;
  onPress?: () => void;
  icon: React.ReactNode;
}) {
  const t = useTokens();
  const inner = (
    <>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: primary ? 'rgba(255,255,255,0.2)' : t.chip,
          marginBottom: 8,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <Text style={{ fontFamily: font.sans(primary ? 700 : 600), fontSize: 12, color: primary ? '#fff' : t.ink }}>{label}</Text>
    </>
  );
  if (primary) {
    return (
      <Pressable onPress={onPress} style={{ flex: 1 }}>
        <LinearGradient
          colors={[BRAND.sky, BRAND.blue]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', ...shadow(BRAND.blue) }}
        >
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', ...elevation(t.elevColor) }}
    >
      {inner}
    </Pressable>
  );
}

const shadow = (c: string) => ({ shadowColor: c, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.55, shadowRadius: 18, elevation: 8 });

function RewardCardSmall({ name, cost, affordable }: { name: string; cost: string; affordable: boolean }) {
  const t = useTokens();
  return (
    <View style={{ width: 158, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, overflow: 'hidden', ...elevation(t.elevColor) }}>
      <View style={{ height: 96, backgroundColor: '#e3e3e6', alignItems: 'center', justifyContent: 'flex-end', padding: 8 }}>
        <Text style={{ fontFamily: font.mono(500), fontSize: 9, color: '#7a7a82', backgroundColor: 'rgba(255,255,255,0.75)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>reward image</Text>
      </View>
      <View style={{ padding: 11 }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: t.ink }}>{name}</Text>
        <View style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: affordable ? 'rgba(191,242,5,0.24)' : t.chip, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
          <Text style={{ fontFamily: font.mono(600), fontSize: 11, color: affordable ? '#4d5c00' : t.faint }}>{cost}</Text>
        </View>
      </View>
    </View>
  );
}

export default function WalletDetail() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen pad topInset={false}>
      {/* gradient hero */}
      <LinearGradient
        colors={[BRAND.blue, BRAND.deep]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ paddingTop: insets.top + 12, paddingHorizontal: 22, paddingBottom: 30 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} style={glassBtn}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 5l-7 7 7 7" />
            </Svg>
          </Pressable>
          <View style={glassBtn}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round">
              <Circle cx={5} cy={12} r={1} />
              <Circle cx={12} cy={12} r={1} />
              <Circle cx={19} cy={12} r={1} />
            </Svg>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 22 }}>
          <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.display(800), fontSize: 22, color: BRAND.blue }}>CB</Text>
          </View>
          <View>
            <Text style={{ fontFamily: font.display(700), fontSize: 20, color: '#fff' }}>Camel Bean</Text>
            <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.82)' }}>Specialty coffee · 6 branches</Text>
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.78)' }}>Your balance</Text>
          <Text style={{ fontFamily: font.display(700), fontSize: 64, color: '#fff', letterSpacing: -1.8, marginTop: 4 }}>2,480</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <View style={{ backgroundColor: 'rgba(191,242,5,0.22)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 12, color: BRAND.lime }}>🏅 Gold tier</Text>
            </View>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>320 pts to Black</Text>
          </View>
          <View style={{ marginTop: 12, height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            <View style={{ width: '82%', height: '100%', borderRadius: 999, backgroundColor: BRAND.lime }} />
          </View>
        </View>
      </LinearGradient>

      {/* quick actions */}
      <View style={{ flexDirection: 'row', gap: 11, paddingHorizontal: 22, paddingTop: 18 }}>
        <QuickAction
          label="Show QR"
          onPress={() => router.push('/scan')}
          icon={
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={1.9} strokeLinecap="round">
              <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
              <Path d="M4 12h16" />
            </Svg>
          }
        />
        <QuickAction
          label="Convert"
          primary
          onPress={() => router.push('/convert/intro')}
          icon={
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M17 4v6h-6M7 20v-6h6" />
              <Path d="M19 10a7 7 0 0 0-13-2M5 14a7 7 0 0 0 13 2" />
            </Svg>
          }
        />
        <QuickAction
          label="Rewards"
          onPress={() => router.push('/rewards')}
          icon={
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 3l2.4 5 5.6.6-4 3.9 1.1 5.5L12 15.8 6.9 18l1.1-5.5-4-3.9 5.6-.6z" />
            </Svg>
          }
        />
      </View>

      {/* how you earn */}
      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        <Pressable onPress={() => router.push(`/wallet/${id}/earn`)} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 24, padding: 16, ...elevation(t.elevColor) }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 14, color: t.ink, marginBottom: 12 }}>How you earn</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 11 }}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: BRAND.lime }} />
            <Text style={{ fontSize: 13.5, color: t.soft }}>1 pt per AED spent in-store & online</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: BRAND.blue }} />
            <Text style={{ fontSize: 13.5, color: t.soft }}>2× happy hour · Thursdays 4–6pm</Text>
          </View>
        </Pressable>
      </View>

      {/* rewards strip */}
      <View style={{ paddingTop: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 12 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: t.ink }}>Rewards</Text>
          <Pressable onPress={() => router.push('/rewards')}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 12, color: BRAND.blue }}>See all</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 13, paddingHorizontal: 22 }}>
          <RewardCardSmall name="Free flat white" cost="450 pts" affordable />
          <RewardCardSmall name="Pastry of the day" cost="800 pts" affordable={false} />
        </ScrollView>
      </View>

      {/* activity */}
      <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: t.ink, marginBottom: 12 }}>Recent activity</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(191,242,5,0.22)', alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#4d5c00" strokeWidth={2.2} strokeLinecap="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.ink }}>Earned at JLT branch</Text>
            <Text style={{ fontSize: 12, color: t.faint }}>Today · 9:12am</Text>
          </View>
          <Text style={{ fontFamily: font.sans(700), fontSize: 14, color: '#4d5c00' }}>+120</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(11,4,217,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M17 4v6h-6M7 20v-6h6" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.ink }}>Converted to Lulu</Text>
            <Text style={{ fontSize: 12, color: t.faint }}>Mon · 2:40pm</Text>
          </View>
          <Text style={{ fontFamily: font.sans(700), fontSize: 14, color: BRAND.blue }}>−1,000</Text>
        </View>
      </View>
    </Screen>
  );
}

const glassBtn = {
  width: 36,
  height: 36,
  borderRadius: 999,
  backgroundColor: 'rgba(255,255,255,0.16)',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
