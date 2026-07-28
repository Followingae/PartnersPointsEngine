import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Chevron, Row } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

export default function ProfileTab() {
  const t = useTokens();
  const router = useRouter();

  return (
    <Screen pad>
      {/* identity */}
      <View style={{ paddingHorizontal: 22, paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 15 }}>
        <LinearGradient
          colors={[BRAND.sky, BRAND.blue]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 66, height: 66, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: font.display(800), fontSize: 26, color: '#fff' }}>M</Text>
        </LinearGradient>
        <View>
          <Text style={{ fontFamily: font.display(700), fontSize: 22, letterSpacing: -0.2, color: t.ink }}>Maya Haddad</Text>
          <Text style={{ fontSize: 13, color: t.soft }}>Member since 2024</Text>
        </View>
      </View>

      {/* completion card */}
      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        <View style={[{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, padding: 14, paddingHorizontal: 16 }, elevation(t.elevColor)]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: t.soft }}>Profile 70% complete</Text>
            <Text style={{ fontSize: 13, fontFamily: font.sans(700), color: BRAND.blue }}>+50 pts left</Text>
          </View>
          <View style={{ marginTop: 10, height: 7, borderRadius: 999, backgroundColor: t.chip, overflow: 'hidden' }}>
            <LinearGradient colors={[BRAND.blue, BRAND.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: '70%', height: '100%', borderRadius: 999 }} />
          </View>
        </View>
      </View>

      {/* settings list */}
      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        <Pressable onPress={() => router.push('/profile/edit')}><Row emoji="👤" label="Personal details" /></Pressable>
        <Pressable onPress={() => router.push('/profile/partners')}>
          <Row
            emoji="🔗"
            label="Linked partners"
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontFamily: font.sans(600), fontSize: 12, color: BRAND.blue, marginRight: 6 }}>Lulu</Text>
                <Chevron />
              </View>
            }
          />
        </Pressable>
        <Pressable onPress={() => router.push('/profile/notifications')}><Row emoji="🔔" label="Notifications" /></Pressable>
        <Pressable onPress={() => router.push('/profile/security')}><Row emoji="🔒" label="Security" /></Pressable>
        <Pressable onPress={() => router.push('/profile/appearance')}><Row emoji="🎨" label="Appearance" /></Pressable>
        <Pressable onPress={() => router.push('/help')}><Row emoji="❓" label="Help & support" last /></Pressable>
      </View>

      <Pressable onPress={() => router.push('/signout')} style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <Text style={{ textAlign: 'center', fontFamily: font.sans(700), fontSize: 14, color: BRAND.coral }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}
