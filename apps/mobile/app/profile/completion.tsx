import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BackBar, Lede } from '@/components/Bits';
import { ErrorState, H1, Loading, Progress, Screen, Small } from '@/components/UI';
import { getProfile } from '@/lib/api';
import { completion } from '@/lib/completion';
import { useAsync } from '@/lib/useAsync';
import { C, R, font } from '@/lib/tokens';

/**
 * 79 · Profile — completion.
 *
 * The always-available way in. Everything the prompts ask for is here without
 * being asked, so a customer who dismissed a popup three times still has
 * somewhere to go — which is what makes retiring the popups acceptable.
 *
 * Answered rows show the answer rather than a tick alone: seeing what is on
 * file is half the reason to open this screen.
 */
export default function ProfileCompletion() {
  const router = useRouter();
  const { data, loading, refreshing, error, signedOut, refresh } = useAsync(getProfile, []);
  const c = completion(data);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>{c.complete ? 'Your profile' : 'Finish your profile'}</H1>
      <Lede style={{ marginTop: 10 }}>
        {c.complete
          ? 'Everything is filled in. You can change any of it whenever you like.'
          : 'Each answer makes what a brand sends you a little less generic.'}
      </Lede>

      {loading ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Progress value={c.done} total={c.total} height={6} />
            </View>
            <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 19, color: C.muted }}>
              {`${c.done} of ${c.total}`}
            </Text>
          </View>

          <View style={{ marginTop: 22 }}>
            {c.items.map((item, i) => (
              <Pressable
                key={item.key}
                // An answered row is still tappable: seeing it is one thing,
                // correcting it is another.
                onPress={() => router.push(item.href)}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingVertical: 17,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: C.hairline,
                  },
                  pressed ? { opacity: 0.7 } : null,
                ]}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    backgroundColor: item.done ? C.ink : 'transparent',
                    borderWidth: item.done ? 0 : 1.5,
                    borderColor: C.hairline,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.done ? (
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M5 12.5l4.5 4.5L19 7.5" />
                    </Svg>
                  ) : null}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.ink }}>
                    {item.label}
                  </Text>
                  <Small style={{ marginTop: 3, fontSize: 12.5, lineHeight: 18 }}>
                    {item.done ? (item.value ?? 'Done') : item.why}
                  </Small>
                </View>

                {!item.done ? (
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: R.chip,
                      backgroundColor: C.wash,
                    }}
                  >
                    <Text style={{ fontFamily: font(600), fontSize: 12.5, lineHeight: 18, color: C.ink }}>Add</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
