import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import { PrimaryButton } from './_components';

function DateField({ label, value, active, flex, dim }: { label: string; value: string; active?: boolean; flex: number; dim?: boolean }) {
  const t = useTokens();
  return (
    <View
      style={{
        flex,
        height: 58,
        borderRadius: 16,
        backgroundColor: t.card,
        borderWidth: active ? 2 : 1,
        borderColor: active ? BRAND.blue : t.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: font.sans(400), fontSize: 10, color: active ? BRAND.blue : t.faint }}>{label}</Text>
      <Text style={{ fontFamily: font.display(700), fontSize: 18, color: dim ? t.faint : t.ink }}>{value}</Text>
    </View>
  );
}

export default function Profiling() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <View style={{ height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: font.sans(600), fontSize: 13, color: t.soft }}>Step 2 of 4</Text>
          <Pressable onPress={() => router.push('/onboarding/first-merchant')}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.soft }}>Skip</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 26, paddingTop: 8 }}>
          <View style={{ height: 7, borderRadius: 999, backgroundColor: t.chip, overflow: 'hidden' }}>
            <View style={{ width: '50%', height: '100%', borderRadius: 999, backgroundColor: BRAND.blue }} />
          </View>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 26 }}>
          <Text style={{ fontSize: 46 }}>🎂</Text>
          <Text style={{ marginTop: 18, fontFamily: font.display(700), fontSize: 30, lineHeight: 31, letterSpacing: -0.6, color: t.ink }}>When&apos;s your birthday?</Text>
          <Text style={{ marginTop: 12, fontFamily: font.sans(400), fontSize: 15, color: t.soft }}>So we can send you a treat every year.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 26 }}>
            <DateField label="DAY" value="14" flex={1} />
            <DateField label="MONTH" value="March" active flex={1.4} />
            <DateField label="YEAR" value="––––" dim flex={1.1} />
          </View>
          <View style={{ marginTop: 18, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(191,242,5,0.24)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 }}>
            <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: '#4d5c00' }}>🎁 Birthday treats await · +50 pts</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
          <PrimaryButton label="Continue" onPress={() => router.push('/onboarding/account-found')} />
        </View>
      </View>
    </Screen>
  );
}
