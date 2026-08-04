import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { PromptSheet } from '@/components/PromptSheet';
import { Small } from '@/components/UI';
import { getProfile } from '@/lib/api';
import { completion, outstandingLine } from '@/lib/completion';
import { dismiss, markShown, settle } from '@/lib/prompts';
import { useAsync } from '@/lib/useAsync';
import { C, R, font } from '@/lib/tokens';

/**
 * 84 · Popup on app load.
 *
 * Names what is actually outstanding rather than nagging in general, and says
 * what each answer is for. The design put "+50 pts" against the birthday and
 * "no points, still useful" against nationality; the platform does not pay for
 * personal information, so both rows say what they are for and neither
 * mentions points.
 */
export default function ProfilePrompt() {
  const router = useRouter();
  const { data } = useAsync(getProfile, []);
  const c = completion(data);

  useEffect(() => {
    markShown();
  }, []);

  // Nothing left to ask — never sit in front of a complete profile.
  useEffect(() => {
    if (data && c.complete) {
      void settle('profile');
      router.back();
    }
  }, [data, c.complete, router]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  return (
    <PromptSheet
      title={outstandingLine(c.outstanding.length)}
      body="Brands send birthday rewards and stock what regulars ask for. Takes about twenty seconds."
      primaryLabel="Answer now"
      onPrimary={() => {
        void settle('profile');
        router.replace('/profile/completion');
      }}
      secondaryLabel="Remind me next week"
      onSecondary={() => {
        void dismiss('profile', true);
        close();
      }}
      onDismiss={() => {
        void dismiss('profile');
        close();
      }}
    >
      <View style={{ gap: 10 }}>
        {c.outstanding.slice(0, 3).map((item) => (
          <View
            key={item.key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              backgroundColor: C.canvas,
              borderRadius: R.tile,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>
              {item.label}
            </Text>
            <Small style={{ flexShrink: 1, textAlign: 'right', fontSize: 12, lineHeight: 17 }}>
              {item.why}
            </Small>
          </View>
        ))}
      </View>
    </PromptSheet>
  );
}
