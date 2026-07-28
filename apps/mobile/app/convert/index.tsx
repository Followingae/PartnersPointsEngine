import { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, H1, Label, Progress, Screen, Small, pts } from '@/components/UI';
import { C, R, font } from '@/lib/tokens';
import { Footer, Ic, TopBar } from '@/components/RewardKit';

/** Points the customer holds across every card that Lulu accepts. */
const ELIGIBLE = 3240;
/** Fixed conversion: 5 points in, 1 Lulu point out. */
const RATE = 5;
const STEP = 250;
const MIN = 250;

function StepButton({ icon, onPress, disabled }: { icon: 'minus' | 'plus'; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          width: 52, height: 52, borderRadius: R.chip, backgroundColor: C.canvas,
          alignItems: 'center', justifyContent: 'center',
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ic name={icon} size={20} sw={2.2} />
    </Pressable>
  );
}

/**
 * Screen 39 — pick how many points to move. The picker is live but local; the
 * quote it shows is the fixed published rate until the API is wired up.
 */
export default function Convert() {
  const router = useRouter();
  const [amount, setAmount] = useState(2000);

  const maxAmount = useMemo(() => Math.floor(ELIGIBLE / STEP) * STEP, []);
  // TODO(api): previewConvert — the server owns the rate and any rounding.
  const luluOut = Math.floor(amount / RATE);

  const clamp = (next: number) => setAmount(Math.max(MIN, Math.min(maxAmount, next)));

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar />

      <H1 style={{ marginTop: 20 }}>Convert points</H1>

      {/* Destination account */}
      <View style={{
        marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18, backgroundColor: C.canvas,
      }}>
        <View style={{
          width: 42, height: 42, borderRadius: 13, backgroundColor: C.surface,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Image source={require('@/assets/lulu-icon.png')} style={{ width: 30, height: 30, resizeMode: 'contain' }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font(600), fontSize: 14.5, color: C.ink }}>Lulu Happiness Points</Text>
          <Small style={{ marginTop: 3, fontSize: 12.5 }}>•••• 4821 · linked</Small>
        </View>
        <Ic name="check" size={18} color={C.greenDeep} sw={2.2} />
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Label style={{ fontSize: 12, letterSpacing: 1.2 }}>Eligible across your cards</Label>
        <Text style={{ marginTop: 14, fontFamily: font(600), fontSize: 60, letterSpacing: -2.4, color: C.ink }}>
          {pts(ELIGIBLE)}
        </Text>

        <View style={{ marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <StepButton icon="minus" onPress={() => clamp(amount - STEP)} disabled={amount <= MIN} />
          <Text style={{
            minWidth: 120, textAlign: 'center',
            fontFamily: font(600), fontSize: 30, letterSpacing: -0.9, color: C.ink,
          }}>
            {pts(amount)}
          </Text>
          <StepButton icon="plus" onPress={() => clamp(amount + STEP)} disabled={amount >= maxAmount} />
        </View>

        <View style={{ marginTop: 18, width: 220 }}>
          <Progress value={amount} total={maxAmount} />
        </View>

        <View style={{
          marginTop: 30, alignSelf: 'stretch', paddingVertical: 18, paddingHorizontal: 22,
          borderRadius: 20, backgroundColor: C.canvas, alignItems: 'center',
        }}>
          <Text style={{ fontFamily: font(500), fontSize: 12.5, color: C.muted }}>You receive</Text>
          <Text style={{ marginTop: 8, fontFamily: font(600), fontSize: 34, letterSpacing: -1, color: C.ink }}>
            {pts(luluOut)}
          </Text>
          <Small style={{ marginTop: 6, fontSize: 12.5 }}>Lulu points · {RATE} pts = 1</Small>
        </View>
      </View>

      <Footer>
        <Button
          label="Convert"
          onPress={() => router.push({ pathname: '/convert/review', params: { amount: String(amount) } })}
        />
      </Footer>
    </Screen>
  );
}
