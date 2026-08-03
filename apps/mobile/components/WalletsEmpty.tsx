import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { Body, Button, H2 } from '@/components/UI';
import { C } from '@/lib/tokens';

/**
 * 10 · No cards yet.
 *
 * This was a route of its own, which meant the design's empty state was never
 * seen: Cards rendered a small inline `EmptyState` instead, and nothing linked
 * to the full-screen one. Making it a component rather than a screen settles
 * that — Cards shows this, so there is one empty case said one way, and it
 * keeps the tab bar under it, which a pushed route would have taken away from
 * someone who has nothing else to tap.
 */
export function WalletsEmpty() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 40 }}>
      <View
        style={{
          width: '100%',
          height: 180,
          borderRadius: 24,
          backgroundColor: C.wash,
          alignItems: 'center',
          justifyContent: 'center',
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
      <Button
        label="Scan a code"
        tone="ghost"
        onPress={() => router.push('/scan/camera')}
        style={{ marginTop: 10, alignSelf: 'stretch', height: 58, borderRadius: 18 }}
      />
    </View>
  );
}
