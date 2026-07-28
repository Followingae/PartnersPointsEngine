import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/lib/theme';
import { BRAND, font, elevation } from '@/lib/tokens';

const CONFETTI = [
  { left: '10%', top: 60, w: 9, h: 14, r: 2, c: BRAND.blue },
  { left: '32%', top: 30, w: 8, h: 8, r: 999, c: BRAND.lime },
  { left: '62%', top: 80, w: 9, h: 13, r: 2, c: BRAND.purple },
  { left: '82%', top: 40, w: 8, h: 8, r: 999, c: BRAND.sky },
];

export default function JoinConfirm() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas, paddingTop: insets.top }}>
      {CONFETTI.map((c, i) => (
        <View key={i} style={{ position: 'absolute', top: c.top, left: c.left as never, width: c.w, height: c.h, borderRadius: c.r, backgroundColor: c.c }} />
      ))}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
        <View style={{ width: 88, height: 88, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...elevation(t.elevColor) }}>
          <Text style={{ fontFamily: font.display(800), fontSize: 34, color: BRAND.blue }}>CB</Text>
        </View>
        <Text style={{ marginTop: 26, fontFamily: font.display(700), fontSize: 28, lineHeight: 29, letterSpacing: -0.6, color: t.ink, textAlign: 'center' }}>You've joined Camel Bean!</Text>
        <Text style={{ marginTop: 12, fontSize: 15, color: t.soft, textAlign: 'center' }}>Your wallet is ready. Here's a little something to start.</Text>
        <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(191,242,5,0.24)', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999 }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: '#4d5c00' }}>🎁 +100 pts welcome bonus</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 26, paddingBottom: 36 + insets.bottom }}>
        <Pressable onPress={() => router.replace(`/wallet/${id}`)} style={{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>View my wallet</Text>
        </Pressable>
      </View>
    </View>
  );
}
