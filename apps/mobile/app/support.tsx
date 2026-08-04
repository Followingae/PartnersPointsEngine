import { useRouter } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BackBar, Icon, ListRow, Tile } from '@/components/Bits';
import { H1, Screen, Small } from '@/components/UI';
import { C, font } from '@/lib/tokens';

/**
 * 60 · Contact support.
 *
 * Both routes out are real: the email opens a composed message, and the hours
 * are stated so nobody sits waiting at midnight for a reply that starts at
 * nine. Chat is not built, so it is not offered — a channel that goes nowhere
 * is worse than one fewer channel.
 */
const EMAIL = 'help@partnerspoints.ae';

export default function Support() {
  const router = useRouter();

  return (
    <Screen>
      <BackBar fallback="/help" />

      <H1 style={{ marginTop: 20 }}>Contact support</H1>
      <Small style={{ marginTop: 10, fontSize: 14, lineHeight: 20 }}>
        Weekdays 9 AM to 9 PM, Gulf time.
      </Small>

      <View style={{ marginTop: 26 }}>
        <ListRow
          divider={false}
          lead={
            <Tile>
              <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5Z" />
                <Path d="m3.5 7 8.5 6 8.5-6" />
              </Svg>
            </Tile>
          }
          title="Email"
          sub={EMAIL}
          onPress={() => {
            void Linking.openURL(
              `mailto:${EMAIL}?subject=${encodeURIComponent('Partners Points support')}`,
            );
          }}
        />
        <ListRow
          lead={<Tile><Icon name="help" size={19} /></Tile>}
          title="Common questions"
          sub="Points, rewards, expiry and cards"
          onPress={() => router.replace('/help')}
        />
      </View>

      <Text
        style={{
          marginTop: 26,
          fontFamily: font(500),
          fontSize: 12.5,
          lineHeight: 19,
          color: C.faint,
        }}
      >
        Tell us the brand and roughly when you visited and we can usually find the transaction
        without anything else.
      </Text>
    </Screen>
  );
}
