import { Image, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useTheme, useTokens } from '@/lib/theme';
import { BRAND, font, elevation } from '@/lib/tokens';

/** A small SVG tier ring (e.g. 82% toward next tier). */
function TierRing({ pct, size = 52, inner = '#070459', label }: { pct: number; size?: number; inner?: string; label: string }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.22)" strokeWidth={5} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={BRAND.lime} strokeWidth={5} fill="none" strokeDasharray={`${(c * pct) / 100} ${c}`} strokeLinecap="round" />
      </Svg>
      <View style={{ width: size - 12, height: size - 12, borderRadius: 999, backgroundColor: inner, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: '#fff' }}>{label}</Text>
      </View>
    </View>
  );
}

function LuluBadge({ bg = 'rgba(255,255,255,0.92)', color = BRAND.blue }: { bg?: string; color?: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ fontFamily: font.sans(700), fontSize: 10.5, color }}>✦ Lulu</Text>
    </View>
  );
}

const CATEGORIES = ['All', '☕ Coffee', '🍽 Dining', '🛒 Grocery', '💄 Beauty'];

const NEARBY = [
  { id: 'olive-thyme', code: 'OT', name: 'Olive & Thyme', sub: 'Dining · 0.4 km away', earn: 'Earn 1 pt / AED', lulu: true, colors: ['#F2622E', '#c94512'], cta: 'Join' },
  { id: 'bloom-coffee', code: 'BC', name: 'Bloom Coffee', sub: 'Coffee · 0.8 km away', earn: 'Earn 2 pt / AED', lulu: false, colors: ['#070459', '#0B04D9'], cta: 'Join' },
  { id: 'kasa-home', code: 'KH', name: 'Kasa Home', sub: 'Home · 1.2 km away', earn: 'Earn 1 pt / AED', lulu: true, colors: ['#1B78F2', '#0B04D9'], cta: 'View' },
];

export default function HomeTab() {
  const t = useTokens();
  const { theme } = useTheme();
  const router = useRouter();
  const wordmark = theme === 'dark'
    ? require('../../assets/pp-wordmark-light.png')
    : require('../../assets/pp-wordmark-dark.png');

  return (
    <Screen pad>
      {/* header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Image source={wordmark} style={{ height: 21, width: 150 }} resizeMode="contain" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.push('/notifications')} style={{ width: 42, height: 42, borderRadius: 999, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', ...elevation(t.elevColor) }}>
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={1.8} strokeLinecap="round">
              <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
              <Path d="M10.5 20a1.8 1.8 0 0 0 3 0" />
            </Svg>
            <View style={{ position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 999, backgroundColor: BRAND.coral, borderWidth: 2, borderColor: t.card }} />
          </Pressable>
          <Pressable onPress={() => router.push('/profile')}>
            <LinearGradient colors={[BRAND.sky, BRAND.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 42, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.display(800), fontSize: 16, color: '#fff' }}>M</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {/* greeting */}
      <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <Text style={{ fontSize: 14, color: t.soft }}>Good morning,</Text>
        <Text style={{ fontFamily: font.display(700), fontSize: 26, color: t.ink, marginTop: 2 }}>Maya 👋</Text>
      </View>

      {/* search */}
      <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
        <Pressable onPress={() => router.push('/discover')} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 14, ...elevation(t.elevColor) }}>
          <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="M20 20l-3.2-3.2" />
          </Svg>
          <Text style={{ flex: 1, fontSize: 14.5, color: t.faint }}>Search cafés, shops & brands</Text>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.soft} strokeWidth={2} strokeLinecap="round">
              <Path d="M4 6h16M7 12h10M10 18h4" />
            </Svg>
          </View>
        </Pressable>
      </View>

      {/* categories */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 2 }}>
        {CATEGORIES.map((cat, i) => (
          <View key={cat} style={{ backgroundColor: i === 0 ? BRAND.blue : t.chip, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999 }}>
            <Text style={{ fontFamily: font.sans(i === 0 ? 700 : 600), fontSize: 12.5, color: i === 0 ? '#fff' : t.ink }}>{cat}</Text>
          </View>
        ))}
      </View>

      {/* discover near you */}
      <View style={{ paddingHorizontal: 22, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 19, color: t.ink }}>Discover near you</Text>
        <Pressable onPress={() => router.push('/discover/map')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
            <Circle cx={12} cy={10} r={2.5} />
          </Svg>
          <Text style={{ fontFamily: font.sans(600), fontSize: 12, color: BRAND.blue }}>Map</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 22, paddingTop: 13, gap: 12 }}>
        {NEARBY.map((m) => (
          <Pressable key={m.id} onPress={() => router.push(`/merchant/${m.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 14, ...elevation(t.elevColor) }}>
            <LinearGradient colors={m.colors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.display(800), fontSize: 16, color: '#fff' }}>{m.code}</Text>
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ fontFamily: font.sans(700), fontSize: 14.5, color: t.ink }}>{m.name}</Text>
                {m.lulu ? (
                  <View style={{ backgroundColor: 'rgba(11,4,217,0.1)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                    <Text style={{ fontFamily: font.sans(700), fontSize: 9.5, color: BRAND.blue }}>✦ Lulu</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 12, color: t.faint, marginTop: 2 }}>{m.sub}</Text>
              <Text style={{ fontSize: 12, color: t.soft, marginTop: 4 }}>{m.earn}</Text>
            </View>
            <Pressable onPress={() => router.push(m.cta === 'Join' ? `/join/${m.id}` : `/merchant/${m.id}`)} style={{ backgroundColor: m.cta === 'Join' ? BRAND.blue : t.chip, paddingHorizontal: 17, paddingVertical: 10, borderRadius: 999 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 12.5, color: m.cta === 'Join' ? '#fff' : t.ink }}>{m.cta}</Text>
            </Pressable>
          </Pressable>
        ))}
      </View>

      {/* banner */}
      <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <Pressable onPress={() => router.push('/promo')}>
          <LinearGradient colors={['#070459', '#0B04D9', '#7A36D9']} locations={[0, 0.58, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: 22, ...elevation(t.elevColor) }}>
            <Text style={{ fontFamily: font.mono(600), fontSize: 11, letterSpacing: 1.5, color: BRAND.lime, textTransform: 'uppercase' }}>Happy hour · today 4–6pm</Text>
            <Text style={{ fontFamily: font.display(700), fontSize: 21, color: '#fff', marginTop: 8, maxWidth: 230, lineHeight: 24 }}>Earn 2× points at Camel Bean ☕</Text>
            <View style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: BRAND.lime, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999 }}>
              <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: '#262626' }}>See offer →</Text>
            </View>
          </LinearGradient>
        </Pressable>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          <View style={{ width: 18, height: 6, borderRadius: 999, backgroundColor: BRAND.blue }} />
          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: t.ink, opacity: 0.18 }} />
          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: t.ink, opacity: 0.18 }} />
        </View>
      </View>

      {/* your wallets */}
      <View style={{ paddingHorizontal: 22, paddingTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.sans(700), fontSize: 19, color: t.ink }}>Your wallets</Text>
        <Text style={{ fontFamily: font.mono(600), fontSize: 13, color: t.faint }}>3 merchants</Text>
      </View>

      <View style={{ paddingHorizontal: 22, paddingTop: 14, gap: 14 }}>
        {/* Camel Bean */}
        <Pressable onPress={() => router.push('/wallet/camel-bean')}>
          <LinearGradient colors={['#0B04D9', '#070459']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, padding: 19, ...elevation(t.elevColor) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: font.display(800), fontSize: 16, color: BRAND.blue }}>CB</Text>
                </View>
                <View>
                  <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: '#fff' }}>Camel Bean</Text>
                  <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)' }}>Coffee · Gold tier</Text>
                </View>
              </View>
              <LuluBadge />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16 }}>
              <View>
                <Text style={{ fontFamily: font.display(700), fontSize: 44, color: '#fff', letterSpacing: -0.9 }}>2,480</Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 6 }}>points · 320 to Black</Text>
              </View>
              <TierRing pct={82} label="82%" />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Núr */}
        <Pressable onPress={() => router.push('/wallet/nur')}>
          <LinearGradient colors={['#7A36D9', '#4A1E99']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, padding: 19, ...elevation(t.elevColor) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: font.display(800), fontSize: 18, color: '#7A36D9' }}>N</Text>
                </View>
                <View>
                  <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: '#fff' }}>Núr Pâtisserie</Text>
                  <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)' }}>Bakery · Silver tier</Text>
                </View>
              </View>
              <View style={{ backgroundColor: BRAND.coral, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                <Text style={{ fontFamily: font.sans(700), fontSize: 10.5, color: '#fff' }}>Expiring</Text>
              </View>
            </View>
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontFamily: font.display(700), fontSize: 38, color: '#fff', letterSpacing: -0.8 }}>1,150</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>points · 90 expiring Jul 30</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Verde */}
        <Pressable onPress={() => router.push('/wallet/verde')}>
          <LinearGradient colors={['#1B78F2', '#0B04D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, padding: 19, ...elevation(t.elevColor) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: font.display(800), fontSize: 18, color: '#1B78F2' }}>V</Text>
                </View>
                <View>
                  <Text style={{ fontFamily: font.sans(700), fontSize: 15, color: '#fff' }}>Verde Market</Text>
                  <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)' }}>Grocery · Green tier</Text>
                </View>
              </View>
              <LuluBadge color="#1B78F2" />
            </View>
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontFamily: font.display(700), fontSize: 38, color: '#fff', letterSpacing: -0.8 }}>760</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>points · 240 to Gold</Text>
            </View>
          </LinearGradient>
        </Pressable>
      </View>

      {/* profile nudge */}
      <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <Pressable onPress={() => router.push('/profile/edit')} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14, ...elevation(t.elevColor) }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>🎂</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans(700), fontSize: 14, color: t.ink }}>Complete your profile</Text>
            <Text style={{ fontSize: 12, color: t.soft }}>Add your birthday · earn +50 pts</Text>
          </View>
          <Text style={{ fontFamily: font.sans(700), fontSize: 13, color: BRAND.blue }}>+50</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
