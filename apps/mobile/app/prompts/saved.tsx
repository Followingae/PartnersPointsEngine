import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button, Screen, Small } from '@/components/UI';
import { getProfile } from '@/lib/api';
import { completion, outstandingLine } from '@/lib/completion';
import { useAsync } from '@/lib/useAsync';
import { C, R, SP, font } from '@/lib/tokens';

/**
 * 87 · Saved toast.
 *
 * Confirms in place rather than bouncing the customer somewhere, and says what
 * is still outstanding — which is what turns one answer into two without
 * another interruption. The design read "Birthday saved · +50 pts"; nothing
 * pays for this, so it says what was saved and stops there.
 *
 * Closes itself. A confirmation that needs dismissing is a second interruption.
 */
const LINGER_MS = 2600;

export default function SavedPrompt() {
  const router = useRouter();
  const { what } = useLocalSearchParams<{ what?: string }>();
  const { data } = useAsync(getProfile, []);
  const c = completion(data);
  const label = (Array.isArray(what) ? what[0] : what) ?? 'Answer';

  const done = () => router.replace(c.complete ? '/profile/completion' : '/home');

  useEffect(() => {
    const id = setTimeout(() => router.replace('/home'), LINGER_MS);
    return () => clearTimeout(id);
  }, [router]);

  return (
    <Screen background={C.surface} scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.gutter }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 999,
            backgroundColor: C.lime,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12.5l4.5 4.5L19 7.5" />
          </Svg>
        </View>

        <Text
          style={{
            marginTop: 26,
            fontFamily: font(600),
            fontSize: 23,
            lineHeight: 29,
            letterSpacing: -0.5,
            color: C.ink,
            textAlign: 'center',
          }}
        >
          {`${label} saved`}
        </Text>

        <Small style={{ marginTop: 10, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
          {c.complete ? 'That is everything — thank you.' : outstandingLine(c.outstanding.length)}
        </Small>

        <Button
          label={c.complete ? 'See my profile' : 'Finish'}
          onPress={done}
          style={{ marginTop: 28, alignSelf: 'stretch', height: 56, borderRadius: R.card }}
        />
      </View>
    </Screen>
  );
}
