import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';
import { clearToken } from '@/lib/api';

export default function SignOut() {
  const t = useTokens();
  const router = useRouter();

  const signOut = async () => {
    await clearToken();
    router.replace('/onboarding/splash');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      {/* faded profile behind */}
      <View style={{ position: 'absolute', top: 54, left: 22, right: 22, opacity: 0.4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
          <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 66, height: 66, borderRadius: 999 }} />
          <View>
            <Text style={{ fontFamily: font.display(700), fontSize: 22, color: t.ink }}>Maya Haddad</Text>
            <Text style={{ fontSize: 13, color: t.soft }}>Member since 2024</Text>
          </View>
        </View>
      </View>

      {/* dim overlay */}
      <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(38,38,38,0.38)' }} />

      {/* confirm sheet */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: t.card,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            paddingHorizontal: 24,
            paddingTop: 26,
            paddingBottom: 40,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -20 },
            shadowOpacity: 0.45,
            shadowRadius: 30,
            elevation: 20,
          }}
        >
          <View style={{ width: 66, height: 66, borderRadius: 999, backgroundColor: 'rgba(242,98,46,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={BRAND.coral} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 12H4M8 8l-4 4 4 4M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
            </Svg>
          </View>
          <Text style={{ marginTop: 18, fontFamily: font.display(700), fontSize: 22, color: t.ink }}>Sign out?</Text>
          <Text style={{ marginTop: 10, fontSize: 14.5, color: t.soft, textAlign: 'center' }}>You&apos;ll need your number and a code to sign back in.</Text>
          <Pressable onPress={signOut} style={{ width: '100%', marginTop: 22, backgroundColor: BRAND.coral, borderRadius: 18, paddingVertical: 17, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>Sign out</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: t.soft }}>Stay signed in</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
