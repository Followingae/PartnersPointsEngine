import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, R, font } from '@/lib/tokens';

/**
 * 64 · Offline.
 *
 * The design keeps the cards on screen and stamps the header with when the
 * balances were last true, which is the right call: a customer standing at a
 * till needs their loyalty number more than they need a blank error page, and
 * the number has not changed just because the network has.
 *
 * So this is a bar rather than a screen — the wallet stays visible behind it.
 */
export function OfflineBar({ asOf }: { asOf: Date | null }) {
  const time = asOf
    ? asOf.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <View
      style={{
        marginTop: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: C.wash,
        borderRadius: R.tile,
        paddingHorizontal: 14,
        paddingVertical: 11,
      }}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3.5-2.3M19 13a10 10 0 0 0-6-2.9M2 9a15 15 0 0 1 4-2.6M22 9a15 15 0 0 0-9.5-3M12 20h.01" />
      </Svg>
      <Text style={{ flex: 1, fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: C.muted }}>
        {time ? `Offline · balances as of ${time}` : 'Offline · showing your last balances'}
      </Text>
    </View>
  );
}
