import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Lede, TextAction } from '@/components/Bits';
import { Button, H2 } from '@/components/UI';
import { C, R, S, SP, shadow } from '@/lib/tokens';
import { useSession } from '@/lib/session';

/** Confirm sheet over a dimmed profile. */
export default function SignOut() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();

  const dismiss = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const signOut = async () => {
    await session.signOut();
    router.replace('/signed-out');
  };

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(21,21,15,.38)' }}>
      <Pressable style={{ flex: 1 }} onPress={dismiss} />

      <View
        style={[
          {
            backgroundColor: C.surface,
            borderTopLeftRadius: R.sheet,
            borderTopRightRadius: R.sheet,
            paddingHorizontal: SP.gutter,
            paddingTop: 26,
            paddingBottom: 34 + insets.bottom,
            alignItems: 'center',
          },
          shadow.raised,
        ]}
      >
        <View
          style={{
            width: 66,
            height: 66,
            borderRadius: 999,
            backgroundColor: 'rgba(255,31,107,.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="logout" size={30} color={S.spend} weight={2} />
        </View>

        <H2 style={{ marginTop: 18 }}>Sign out?</H2>
        <Lede center style={{ marginTop: 10 }}>
          You will need your number and a code to sign back in.
        </Lede>

        <Button
          label="Sign out"
          onPress={signOut}
          style={{ alignSelf: 'stretch', marginTop: 22, borderRadius: R.card, height: 58 }}
        />
        <TextAction label="Stay signed in" onPress={dismiss} />
      </View>
    </View>
  );
}
