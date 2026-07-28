import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import { IllusChip, PrimaryButton, StripeOverlay } from './_components';

export default function Carousel() {
  const t = useTokens();
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        {/* skip */}
        <View style={{ height: 46, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 26 }}>
          <Pressable onPress={() => router.push('/onboarding/phone')}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14, color: t.soft }}>Skip</Text>
          </Pressable>
        </View>

        {/* hero */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <LinearGradient
            colors={[BRAND.blue, BRAND.purple]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ width: '100%', aspectRatio: 1, maxHeight: 300, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
          >
            <StripeOverlay />
            <IllusChip />
          </LinearGradient>
          <Text style={{ marginTop: 34, fontFamily: font.display(700), fontSize: 30, lineHeight: 32, letterSpacing: -0.6, textAlign: 'center', color: t.ink }}>
            All your loyalty in one wallet
          </Text>
          <Text style={{ marginTop: 14, fontFamily: font.sans(400), fontSize: 15, lineHeight: 21, textAlign: 'center', color: t.soft }}>
            Every café, shop and brand you love — points, tiers and rewards, together.
          </Text>
        </View>

        {/* footer */}
        <View style={{ paddingHorizontal: 26, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 24 }}>
            <View style={{ width: 22, height: 7, borderRadius: 999, backgroundColor: BRAND.blue }} />
            <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: t.ink, opacity: 0.2 }} />
            <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: t.ink, opacity: 0.2 }} />
            <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: t.ink, opacity: 0.2 }} />
          </View>
          <PrimaryButton label="Get started" onPress={() => router.push('/onboarding/phone')} />
          <Pressable onPress={() => router.push('/onboarding/phone')} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.sans(400), fontSize: 14, color: t.soft }}>
              Already a member? <Text style={{ fontFamily: font.sans(700), color: BRAND.blue }}>Log in</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
