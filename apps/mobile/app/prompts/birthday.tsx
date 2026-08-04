import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { PromptSheet } from '@/components/PromptSheet';
import { PickerSheet, SelectField, type Option } from '@/components/Picker';
import { getProfile, updateProfile } from '@/lib/api';
import { MONTH_NAMES, daysInMonth } from '@/lib/dates';
import { dismiss, markShown, settle } from '@/lib/prompts';
import { useAsync } from '@/lib/useAsync';
import { Small } from '@/components/UI';
import { C } from '@/lib/tokens';

/**
 * 80 · Birthday prompt.
 *
 * The year is optional here, unlike the settings screen: a brand needs the day
 * and month to send something, and insisting on the year is what makes people
 * close the prompt. Stored with a placeholder year when it is left out, which
 * the month-and-day reads ignore.
 *
 * The design offered "+50 pts". Nothing pays for it, so the line says what the
 * answer actually buys them.
 */
const MONTH_OPTIONS: Option[] = MONTH_NAMES.map((label, i) => ({ value: String(i + 1), label }));
const YEAR_OPTIONS: Option[] = Array.from({ length: 111 }, (_, i) => {
  const y = String(new Date().getFullYear() - i);
  return { value: y, label: y };
});

/** Used when someone gives a day and month but not a year. A leap year, so 29 Feb survives. */
const NO_YEAR = '1904';

const pad = (v: string) => v.padStart(2, '0');

export default function BirthdayPrompt() {
  const router = useRouter();
  const { data } = useAsync(getProfile, []);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [sheet, setSheet] = useState<'day' | 'month' | 'year' | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    markShown();
  }, []);

  useEffect(() => {
    if (!data?.birthdate) return;
    const [y, m, d] = data.birthdate.slice(0, 10).split('-');
    if (y && y !== NO_YEAR) setYear(y);
    setMonth(m ? String(Number(m)) : '');
    setDay(d ? String(Number(d)) : '');
  }, [data]);

  const maxDay = month ? daysInMonth(year ? Number(year) : 2024, Number(month)) : 31;
  useEffect(() => {
    if (day && Number(day) > maxDay) setDay(String(maxDay));
  }, [day, maxDay]);

  const dayOptions = useMemo<Option[]>(
    () => Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    [maxDay],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const ready = Boolean(day && month);

  async function save() {
    if (!ready) return;
    const birthdate = `${year || NO_YEAR}-${pad(month)}-${pad(day)}`;
    if (birthdate > new Date().toISOString().slice(0, 10)) {
      setFailed('That birthday is in the future.');
      return;
    }
    setSaving(true);
    setFailed(null);
    try {
      await updateProfile({ birthdate });
      await settle('birthday');
      router.replace({ pathname: '/prompts/saved', params: { what: 'Birthday' } });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save that.');
      setSaving(false);
    }
  }

  return (
    <>
      <PromptSheet
        title="When’s your birthday?"
        body="So a brand can send you something on the day. The year is optional."
        primaryLabel="Save"
        onPrimary={save}
        primaryLoading={saving}
        primaryDisabled={!ready || saving}
        secondaryLabel="Not now"
        onSecondary={() => {
          void dismiss('birthday', true);
          close();
        }}
        onDismiss={() => {
          void dismiss('birthday');
          close();
        }}
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SelectField flex={1} value={day || null} placeholder="Day" onPress={() => setSheet('day')} />
          <SelectField
            flex={1.5}
            value={month ? MONTH_NAMES[Number(month) - 1]! : null}
            placeholder="Month"
            onPress={() => setSheet('month')}
          />
          <SelectField flex={1.1} value={year || null} placeholder="Year" onPress={() => setSheet('year')} />
        </View>
        <Small style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18, color: failed ? C.crimson : C.faint }}>
          {failed ?? 'Optional'}
        </Small>
      </PromptSheet>

      {sheet === 'day' ? (
        <PickerSheet title="Day" options={dayOptions} value={day || null} onSelect={setDay} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'month' ? (
        <PickerSheet title="Month" options={MONTH_OPTIONS} value={month || null} onSelect={setMonth} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'year' ? (
        <PickerSheet
          title="Year"
          options={YEAR_OPTIONS}
          value={year || null}
          onSelect={setYear}
          onClose={() => setSheet(null)}
          clearLabel="Prefer not to say"
          onClear={() => setYear('')}
        />
      ) : null}
    </>
  );
}
