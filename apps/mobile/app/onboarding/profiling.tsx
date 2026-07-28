import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Label, Button, Progress, Screen, Small } from '@/components/UI';
import { C, font } from '@/lib/tokens';
import { Footer, Sub, Title } from './_components';

const STEP = 2;
const STEPS = 3;

/** One segment of the birthday input. Filled segments wash in; empty ones are outlined. */
function DateField({ label, value, flex, filled, dim }: {
  label: string; value: string; flex: number; filled?: boolean; dim?: boolean;
}) {
  return (
    <View
      style={{
        flex,
        height: 60,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        backgroundColor: filled ? C.canvas : C.surface,
        borderWidth: filled ? 0 : 1.5,
        borderColor: C.hairline,
      }}
    >
      <Label style={{ fontSize: 10, lineHeight: 14, letterSpacing: 1 }}>{label}</Label>
      <Text style={{ fontFamily: font(600), fontSize: 17, lineHeight: 24, color: dim ? C.soft : C.ink }}>{value}</Text>
    </View>
  );
}

/** 07 · One question at a time. */
export default function Profiling() {
  const router = useRouter();
  const next = () => router.push('/onboarding/first-merchant');

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Small style={{ fontSize: 13, lineHeight: 18 }}>{`Step ${STEP} of ${STEPS}`}</Small>
        <Pressable onPress={next} hitSlop={10}>
          <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.muted }}>Skip</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 14 }}>
        <Progress value={STEP} total={STEPS} height={4} />
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Title>When’s your birthday?</Title>
        <Sub style={{ marginTop: 12 }}>For your birthday reward.</Sub>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
          <DateField label="Day" value="14" flex={1} />
          <DateField label="Month" value="March" flex={1.5} filled />
          <DateField label="Year" value="––––" flex={1.1} dim />
        </View>

        <Small style={{ marginTop: 20, fontSize: 13.5, lineHeight: 19 }}>+50 pts once it’s saved</Small>
      </View>

      <Footer>
        {/* TODO(api): saveProfileAnswer(birthday) — award the +50 pts server-side. */}
        <Button label="Continue" onPress={next} />
      </Footer>
    </Screen>
  );
}
