import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextAction } from '@/components/Bits';
import { Button, Chip, H2, Label, Small } from '@/components/UI';
import { C, R, SP } from '@/lib/tokens';
import {
  DIRECTION_OPTIONS, NO_FILTERS, TYPE_OPTIONS, setFilters, useActivityFilters, useBrandOptions,
} from '@/app/activity/_filters';

function ChipRow<K extends string | null>({
  options, value, onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (v: K) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
      {options.map((o) => (
        <Pressable
          key={o.key ?? '*'}
          onPress={() => onChange(o.key)}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        >
          <Chip
            label={o.label}
            tone={o.key === value ? 'ink' : 'neutral'}
            style={{ paddingHorizontal: 15, paddingVertical: 9 }}
          />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * 50 · Filter activity — the sheet the Activity tab's filter button opens.
 *
 * Choices are held locally until Apply, so backing out of the sheet leaves the
 * feed as it was. The cards on offer are the ones the loaded feed mentions.
 */
export default function ActivityFilters() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const current = useActivityFilters();
  const brands = useBrandOptions();
  const [draft, setDraft] = useState(current);

  const cardOptions = [
    { key: null as string | null, label: 'All cards' },
    ...brands.map((b) => ({ key: b.id as string | null, label: b.name })),
  ];

  const close = () => (router.canGoBack() ? router.back() : router.replace('/activity'));

  const apply = () => {
    setFilters(draft);
    close();
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
          <ChipRow
            options={TYPE_OPTIONS}
            value={draft.type}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
          />
        </View>

        <View style={{ marginTop: 26 }}>
          <Label>Direction</Label>
          <ChipRow
            options={DIRECTION_OPTIONS}
            value={draft.direction}
            onChange={(direction) => setDraft((d) => ({ ...d, direction }))}
          />
        </View>

        <View style={{ marginTop: 26 }}>
          <Label>Card</Label>
          {brands.length ? (
            <ChipRow
              options={cardOptions}
              value={draft.brandId}
              onChange={(brandId) => setDraft((d) => ({ ...d, brandId }))}
            />
          ) : (
            <Small style={{ marginTop: 12 }}>No cards in your recent activity yet.</Small>
          )}
        </View>

        <View style={{ marginTop: 28 }}>
          <Button label="Apply" onPress={apply} style={{ borderRadius: R.card, height: 58 }} />
          <TextAction label="Reset" onPress={() => setDraft(NO_FILTERS)} />
        </View>
      </View>
    </View>
  );
}
