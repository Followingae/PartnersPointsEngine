import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { Icon, Lede, TextAction } from '@/components/Bits';
import { Button, H1, Screen } from '@/components/UI';
import { R } from '@/lib/tokens';
import { findBadge } from '@/app/badges/_data';

/** 46 · Badge unlocked — the celebration the app pushes after an earn. */
export default function BadgeUnlocked() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // TODO(api): GET /customer/badges/:id
  const b = findBadge(id);

  const dismiss = () => (router.canGoBack() ? router.back() : router.replace('/badges'));

  return (
    <Screen scroll={false} bottomGap={34}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
        <View
          style={{
            width: 148,
            height: 148,
            borderRadius: 44,
            backgroundColor: b.color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={b.unlocked ? 'trophy' : 'lock'} size={66} color={b.glyph} weight={1.4} />
        </View>
        <H1 style={{ marginTop: 34, textAlign: 'center' }}>{b.name}</H1>
        <Lede center style={{ marginTop: 12, paddingHorizontal: 4 }}>{b.blurb}</Lede>
      </View>

      <View>
        <Button
          label={b.unlocked ? 'Nice' : 'Got it'}
          onPress={dismiss}
          style={{ borderRadius: R.card, height: 58 }}
        />
        {b.unlocked ? <TextAction label="Share" onPress={dismiss} /> : null}
      </View>
    </Screen>
  );
}
