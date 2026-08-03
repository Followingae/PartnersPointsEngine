/**
 * Choose-one-from-a-list, in the v3 sheet language.
 *
 * `SelectField` is the form control: it reads like the text fields around it,
 * but opens `PickerSheet` instead of a keyboard. The sheet is the same bottom
 * sheet the filter screens use — grab handle, rounded top, muted backdrop —
 * with an optional search box for lists too long to scan (countries), and no
 * search for the short ones (day, month, year).
 *
 * Render the sheet only while it is open. Mounting it on demand is what lets it
 * open on the current value and start with an empty query every time.
 */
import { useMemo, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Bits';
import { H2, Label, Small } from '@/components/UI';
import { C, R, SP, T, font } from '@/lib/tokens';

export interface Option {
  value: string;
  label: string;
}

/** Fixed so the sheet can open on the current value rather than at the top. */
const ROW_H = 54;

/** Everything in the sheet that isn't a row: handle, title, list padding. */
const CHROME_H = 107;

/**
 * A tappable field. Shows the chosen label, or the placeholder in the same
 * faint tone the text inputs use for theirs.
 */
export function SelectField({
  label, value, placeholder, onPress, style, flex,
}: {
  label?: string;
  /** The label to display, not the stored code. Null renders the placeholder. */
  value: string | null;
  placeholder: string;
  onPress: () => void;
  style?: ViewStyle;
  flex?: number;
}) {
  return (
    <View style={[flex !== undefined ? { flex } : null, style]}>
      {label ? <Label>{label}</Label> : null}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          {
            marginTop: label ? 8 : 0,
            height: 54,
            borderRadius: R.control,
            backgroundColor: C.wash,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          },
          pressed ? { opacity: 0.75 } : null,
        ]}
      >
        <Text numberOfLines={1} style={[T.body, { flex: 1, color: value ? C.ink : C.faint }]}>
          {value ?? placeholder}
        </Text>
        {/* The list affordance is the same chevron, turned a quarter. */}
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <Icon name="chevron" size={16} color={C.soft} weight={2} />
        </View>
      </Pressable>
    </View>
  );
}

export function PickerSheet({
  title, options, value, onSelect, onClose, searchable, searchPlaceholder, filter, clearLabel, onClear,
}: {
  title: string;
  options: readonly Option[];
  value: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Custom matching — countries also match on code and on common aliases. */
  filter?: (query: string) => readonly Option[];
  /** Adds a first row that empties the field, for optional details. */
  clearLabel?: string;
  onClear?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    if (filter) return filter(q);
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options, filter]);

  // Only read at mount, which is exactly when the sheet opens.
  const initialIndex = useRef(value ? options.findIndex((o) => o.value === value) : -1).current;

  // The sheet is sized rather than left to its content: a virtualised list
  // measures only the rows it has drawn, so an auto height would grow under
  // the reader as they scrolled. Twelve months get a short sheet, a hundred
  // years get the tall one, and the maximum keeps either off the status bar.
  const rows = options.length + (clearLabel ? 1 : 0);
  const sized = CHROME_H + insets.bottom + rows * ROW_H;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      {/* The keyboard shrinks the backdrop rather than the sheet, so the list
          keeps its height while someone is typing in the search box. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(21,21,15,.45)' }} onPress={onClose} />

        <View
          style={{
            // A searchable list is tall on purpose: it has to stay usable with
            // a keyboard over it.
            height: searchable ? '86%' : sized,
            maxHeight: '86%',
            backgroundColor: C.surface,
            borderTopLeftRadius: R.sheet + 4,
            borderTopRightRadius: R.sheet + 4,
            paddingTop: 14,
            paddingHorizontal: SP.gutter,
            paddingBottom: insets.bottom,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 42, height: 5, borderRadius: R.chip, backgroundColor: 'rgba(21,21,15,.08)' }} />
          </View>

          <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <H2 style={{ flex: 1 }}>{title}</H2>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  width: 36, height: 36, borderRadius: 999, backgroundColor: C.wash,
                  alignItems: 'center', justifyContent: 'center',
                },
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <Icon name="close" size={16} weight={2} />
            </Pressable>
          </View>

          {searchable ? (
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 18,
                backgroundColor: C.canvas, borderRadius: R.tile, paddingHorizontal: 16, paddingVertical: 14,
              }}
            >
              <Icon name="search" size={18} weight={1.9} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                placeholder={searchPlaceholder ?? 'Search'}
                placeholderTextColor={C.soft}
                style={[T.body, { flex: 1, padding: 0, fontSize: 14.5, lineHeight: 20, color: C.ink }]}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={10}>
                  <Icon name="close" size={15} color={C.soft} weight={2} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <FlatList
            style={{ flexShrink: 1, marginTop: searchable ? 6 : 12 }}
            data={results}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 18 }}
            getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
            initialScrollIndex={!query && initialIndex > 5 ? initialIndex : undefined}
            ListHeaderComponent={
              clearLabel && onClear && !query ? (
                <Row
                  label={clearLabel}
                  selected={value === null}
                  tone="muted"
                  onPress={() => {
                    onClear();
                    onClose();
                  }}
                />
              ) : null
            }
            ListEmptyComponent={
              <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                <Small>No matches. Try a different spelling.</Small>
              </View>
            }
            renderItem={({ item }) => (
              <Row
                label={item.label}
                selected={item.value === value}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
              />
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({
  label, selected, onPress, tone = 'ink',
}: { label: string; selected: boolean; onPress: () => void; tone?: 'ink' | 'muted' }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderTopWidth: 1,
          borderTopColor: C.hairline,
        },
        pressed ? { opacity: 0.6 } : null,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: font(selected ? 600 : 500),
          fontSize: 15,
          lineHeight: 21,
          color: tone === 'ink' ? C.ink : C.muted,
        }}
      >
        {label}
      </Text>
      {selected ? <Icon name="check" size={19} color={C.ink} weight={2.4} /> : null}
    </Pressable>
  );
}
