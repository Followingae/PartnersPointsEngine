import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Progress, Screen, Small } from '@/components/UI';
import { PickerSheet, SelectField, type Option } from '@/components/Picker';
import { getProfile, updateProfile } from '@/lib/api';
import { MONTH_NAMES, daysInMonth } from '@/lib/dates';
import { useAsync } from '@/lib/useAsync';
import { C, font } from '@/lib/tokens';
import { Footer, Sub, Title } from './_components';

const STEP = 2;
const STEPS = 3;
const NEXT = '/onboarding/first-merchant';

const MONTH_OPTIONS: Option[] = MONTH_NAMES.map((label, i) => ({ value: String(i + 1), label }));

/** Living memory, newest first — nobody scrolls up to find this year. */
const YEAR_OPTIONS: Option[] = Array.from({ length: 111 }, (_, i) => {
  const y = String(new Date().getFullYear() - i);
  return { value: y, label: y };
});

const pad = (v: string) => v.padStart(2, '0');

type Sheet = 'day' | 'month' | 'year';

/**
 * 07 · One question at a time.
 *
 * The same birthday that Personal details edits, asked once at the start — it
 * writes the same field through the same endpoint, so answering here and then
 * opening the edit screen shows the answer already there, and a birthday
 * already on file prefills rather than being asked for twice.
 *
 * What it doesn't do is promise points for answering. Nothing on the server
 * pays for a filled-in profile; the birthday campaign is the brand's to run.
 */
export default function Profiling() {
  const router = useRouter();
  const { data, signedOut } = useAsync(getProfile, []);

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  // Already answered — don't ask again on every sign-in.
  useEffect(() => {
    if (data?.birthdate) router.replace(NEXT);
  }, [data?.birthdate, router]);

  useEffect(() => {
    if (!data?.birthdate) return;
    const [y, m, d] = data.birthdate.slice(0, 10).split('-');
    setYear(y ?? '');
    setMonth(m ? String(Number(m)) : '');
    setDay(d ? String(Number(d)) : '');
  }, [data]);

  // 29 February exists until a year says otherwise.
  const maxDay = month ? daysInMonth(year ? Number(year) : 2024, Number(month)) : 31;
  useEffect(() => {
    if (day && Number(day) > maxDay) setDay(String(maxDay));
  }, [day, maxDay]);

  const dayOptions = useMemo<Option[]>(
    () => Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    [maxDay],
  );

  const complete = Boolean(day && month && year);
  const birthdate = complete ? `${year}-${pad(month)}-${pad(day)}` : null;

  async function save() {
    if (!birthdate) return;
    if (birthdate > new Date().toISOString().slice(0, 10)) {
      setFailed('That birthday is in the future.');
      return;
    }
    setSaving(true);
    setFailed(null);
    try {
      await updateProfile({ birthdate });
      router.push(NEXT);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save your birthday.');
      setSaving(false);
    }
  }

  return (
    <Screen scroll={false} background={C.surface} bottomGap={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Small style={{ fontSize: 13, lineHeight: 18 }}>{`Step ${STEP} of ${STEPS}`}</Small>
        <Pressable onPress={() => router.push(NEXT)} hitSlop={10}>
          <Text style={{ fontFamily: font(600), fontSize: 14, lineHeight: 20, color: C.muted }}>Skip</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 14 }}>
        <Progress value={STEP} total={STEPS} height={4} />
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Title>When’s your birthday?</Title>
        <Sub style={{ marginTop: 12 }}>So a brand can send you something on the day.</Sub>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
          <SelectField flex={1} value={day || null} placeholder="Day" onPress={() => setSheet('day')} />
          <SelectField
            flex={1.5}
            value={month ? MONTH_NAMES[Number(month) - 1]! : null}
            placeholder="Month"
            onPress={() => setSheet('month')}
          />
          <SelectField flex={1.1} value={year || null} placeholder="Year" onPress={() => setSheet('year')} />
        </View>

        {failed ? (
          <Small style={{ marginTop: 20, fontSize: 13.5, lineHeight: 19, color: C.crimson }}>{failed}</Small>
        ) : (
          <Small style={{ marginTop: 20, fontSize: 13.5, lineHeight: 19 }}>
            You can change this any time in your profile.
          </Small>
        )}
      </View>

      <Footer>
        <Button
          label={complete ? 'Continue' : 'Pick your birthday'}
          onPress={save}
          loading={saving}
          disabled={!complete || saving}
        />
      </Footer>

      {sheet === 'day' ? (
        <PickerSheet
          title="Day"
          options={dayOptions}
          value={day || null}
          onSelect={setDay}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'month' ? (
        <PickerSheet
          title="Month"
          options={MONTH_OPTIONS}
          value={month || null}
          onSelect={setMonth}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'year' ? (
        <PickerSheet
          title="Year"
          options={YEAR_OPTIONS}
          value={year || null}
          onSelect={setYear}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </Screen>
  );
}
