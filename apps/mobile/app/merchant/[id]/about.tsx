import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton, Screen } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

function InfoRow({ icon, text, last }: { icon: React.ReactNode; text: string; last?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }}>
      {icon}
      <Text style={{ flex: 1, fontSize: 14, color: t.ink }}>{text}</Text>
    </View>
  );
}

export default function AboutMerchant() {
  const t = useTokens();
  const stroke = t.faint;
  return (
    <Screen pad>
      <View style={{ paddingHorizontal: 22, paddingTop: 6 }}>
        <BackButton />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <LinearGradient colors={[BRAND.blue, BRAND.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 54, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.display(800), fontSize: 20, color: '#fff' }}>CB</Text>
        </LinearGradient>
        <View>
          <Text style={{ fontFamily: font.display(700), fontSize: 22, color: t.ink, letterSpacing: -0.4 }}>Camel Bean</Text>
          <Text style={{ fontSize: 12.5, color: t.soft }}>Specialty coffee roasters</Text>
        </View>
      </View>
      <Text style={{ marginHorizontal: 22, marginTop: 18, fontSize: 14.5, lineHeight: 22, color: t.soft }}>
        Founded in 2018, Camel Bean roasts small batches sourced from East African farms, served across six cafés in the city.
      </Text>

      {/* map */}
      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        <View style={{ height: 120, borderRadius: 18, backgroundColor: t.map, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: 43, left: 150, width: 34, height: 34, borderRadius: 17, transform: [{ rotate: '-45deg' }], backgroundColor: BRAND.blue, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ transform: [{ rotate: '45deg' }], fontFamily: font.display(800), fontSize: 11, color: '#fff' }}>CB</Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <InfoRow
          text="Cluster Y, JLT · +5 branches"
          icon={
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
              <Circle cx={12} cy={10} r={2.5} />
            </Svg>
          }
        />
        <InfoRow
          text="Open today · 7 AM – 10 PM"
          icon={
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx={12} cy={12} r={9} />
              <Path d="M12 7v5l3 2" />
            </Svg>
          }
        />
        <InfoRow
          text="camelbean.coffee"
          icon={
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx={12} cy={12} r={9} />
              <Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </Svg>
          }
        />
        <InfoRow
          last
          text="+971 4 555 0123"
          icon={
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
            </Svg>
          }
        />
      </View>
    </Screen>
  );
}
