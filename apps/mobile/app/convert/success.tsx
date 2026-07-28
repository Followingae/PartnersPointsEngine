import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, H1, Screen, pts } from '@/components/UI';
import { C, font } from '@/lib/tokens';
import { CenterState, Footer, Ic } from '@/components/RewardKit';

const RATE = 5;
/** Matches the eligible pool on the convert screen. */
const ELIGIBLE = 3240;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, padding: 18, borderRadius: 18, backgroundColor: C.canvas }}>
      <Text style={{ fontFamily: font(500), fontSize: 11.5, color: C.muted }}>{label}</Text>
      <Text style={{ marginTop: 8, fontFamily: font(600), fontSize: 24, letterSpacing: -0.72, color: C.ink }}>
        {value}
      </Text>
    </View>
  );
}

/** Screen 39, success state — both balances, side by side. */
export default function ConvertSuccess() {
  const router = useRouter();
  const { amount } = useLocalSearchParams<{ amount?: string }>();

  const points = Number(amount ?? 2000) || 2000;
  const luluOut = Math.floor(points / RATE);
  const remaining = Math.max(0, ELIGIBLE - points);

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <View style={{
          width: 80, height: 80, borderRadius: 999, backgroundColor: C.green,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ic name="check" size={36} sw={2.4} />
        </View>

        <H1 style={{ marginTop: 28, fontSize: 28, textAlign: 'center' }}>{pts(points)} pts converted</H1>

        <View style={{ marginTop: 30, alignSelf: 'stretch', flexDirection: 'row', gap: 12 }}>
          <StatTile label="Partners Points" value={pts(remaining)} />
          <StatTile label="Lulu" value={pts(luluOut)} />
        </View>
      </CenterState>

      <Footer>
        <Button label="Done" onPress={() => router.replace('/(tabs)/home')} />
      </Footer>
    </Screen>
  );
}
