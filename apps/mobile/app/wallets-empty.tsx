import { useRouter } from 'expo-router';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Body, Button, H1, H2, Screen } from '@/components/UI';
import { C } from '@/lib/tokens';

/** 10 · No cards yet — the empty state behind Cards (home). */
export default function WalletsEmpty() {
  const router = useRouter();

  return (
    <Screen background={C.surface} scroll={false}>
      <View style={{ marginTop: 16 }}>
        <H1>Cards</H1>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
        <View
          style={{
            width: '100%', height: 180, borderRadius: 24, backgroundColor: C.wash,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Rect x={3} y={6} width={18} height={13} rx={3} />
            <Path d="M16 12h3" />
          </Svg>
        </View>

        <H2 style={{ marginTop: 32, textAlign: 'center' }}>Nothing here yet</H2>
        <Body tone="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 22.5, textAlign: 'center' }}>
          Join a brand, or scan the code at a till to claim points you already have.
        </Body>

        <Button
          label="Browse brands"
          onPress={() => router.push('/discover')}
          style={{ marginTop: 26, alignSelf: 'stretch', height: 58, borderRadius: 18 }}
        />
      </View>
    </Screen>
  );
}
