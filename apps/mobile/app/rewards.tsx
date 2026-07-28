import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { BackButton, Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

function RewardImage({ locked }: { locked?: boolean }) {
  return (
    <View style={{ height: 100, backgroundColor: '#e3e3e6', alignItems: 'center', justifyContent: locked ? 'center' : 'flex-end', padding: 7 }}>
      {locked ? (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#7a7a82" strokeWidth={2} strokeLinecap="round">
          <Rect x={5} y={11} width={14} height={9} rx={2} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </Svg>
      ) : (
        <Text style={{ fontFamily: font.mono(500), fontSize: 8.5, color: '#7a7a82', backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>reward image</Text>
      )}
    </View>
  );
}

function RewardCard({ id, name, cost, locked }: { id: string; name: string; cost: string; locked?: boolean }) {
  const t = useTokens();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/rewards/${id}`)} style={{ width: '48%', backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, overflow: 'hidden', opacity: locked ? 0.62 : 1, ...elevation(t.elevColor) }}>
      <RewardImage locked={locked} />
      <View style={{ padding: 11 }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: t.ink }}>{name}</Text>
        <View style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: locked ? t.chip : 'rgba(191,242,5,0.24)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
          <Text style={{ fontFamily: locked ? font.sans(700) : font.mono(600), fontSize: locked ? 10 : 11, color: locked ? t.faint : '#4d5c00' }}>{cost}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function Rewards() {
  const t = useTokens();
  return (
    <Screen pad>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <BackButton fallback="/home" />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 28, color: t.ink, letterSpacing: -0.6 }}>Rewards</Text>
        <View style={{ backgroundColor: 'rgba(191,242,5,0.24)', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: '#4d5c00' }}>2,480 pts</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingTop: 14 }}>
        <View style={{ backgroundColor: BRAND.blue, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 12.5, color: '#fff' }}>Camel Bean</Text>
        </View>
        <View style={{ backgroundColor: t.chip, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999 }}>
          <Text style={{ fontFamily: font.sans(600), fontSize: 12.5, color: t.ink }}>All merchants</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 13 }}>
        <RewardCard id="flat-white" name="Free flat white" cost="450 pts" />
        <RewardCard id="pastry" name="Pastry of the day" cost="800 pts" />
        <RewardCard id="tote" name="Tote & tumbler" cost="1,500 pts" />
        <RewardCard id="reserve" name="Reserve blend bag" cost="🔒 Black tier" locked />
      </View>
    </Screen>
  );
}
