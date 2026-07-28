import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextAction } from '@/components/Bits';
import { Button, Chip, H2, Label } from '@/components/UI';
import { C, R, SP } from '@/lib/tokens';

const TYPES = ['All', 'Earned', 'Redeemed', 'Converted', 'Expired'];
const CARDS = ['All cards', 'Camel Bean', 'Núr', 'Verde'];

function ChipRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}>
          <Chip label={o} tone={o === value ? 'ink' : 'neutral'} style={{ paddingHorizontal: 15, paddingVertical: 9 }} />
        </Pressable>
      ))}
    </View>
  );
}

/** 50 · Filter activity — the sheet the Activity tab's filter button opens. */
export default function ActivityFilters() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState(TYPES[0]);
  const [card, setCard] = useState(CARDS[0]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/activity'));

  // TODO(api): pass the chosen type/card through to GET /customer/activity.
  const apply = () => close();
  const reset = () => {
    setType(TYPES[0]);
    setCard(CARDS[0]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <Stack.Screen options={{ animation: 'slide_from_bottom' }} />

      <Pressable style={{ flex: 1 }} onPress={close} />

      <View
        style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          paddingHorizontal: SP.gutter,
          paddingTop: 14,
          paddingBottom: 32 + insets.bottom,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: 'rgba(21,21,15,.08)' }} />
        </View>

        <H2 style={{ marginTop: 22 }}>Filter activity</H2>

        <View style={{ marginTop: 22 }}>
          <Label>Type</Label>
          <ChipRow options={TYPES} value={type} onChange={setType} />
        </View>

        <View style={{ marginTop: 26 }}>
          <Label>Card</Label>
          <ChipRow options={CARDS} value={card} onChange={setCard} />
        </View>

        <View style={{ marginTop: 28 }}>
          <Button label="Apply" onPress={apply} style={{ borderRadius: R.card, height: 58 }} />
          <TextAction label="Reset" onPress={reset} />
        </View>
      </View>
    </View>
  );
}
