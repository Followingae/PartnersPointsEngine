import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BackBar, Lede } from '@/components/Bits';
import { Body, Button, ErrorState, H1, Label, Loading, Screen, Small } from '@/components/UI';
import { PickerSheet, SelectField, type Option } from '@/components/Picker';
import { getProfile, setEmail, updateProfile } from '@/lib/api';
import { COUNTRIES, countryName, searchCountries } from '@/lib/countries';
import { MONTH_NAMES, daysInMonth } from '@/lib/dates';
import { useAsync } from '@/lib/useAsync';
import { C, R, S, T, font } from '@/lib/tokens';

function Field({
  label, value, onChange, editable = true, keyboard, placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
  keyboard?: 'default' | 'email-address' | 'numbers-and-punctuation';
  placeholder?: string;
}) {
  return (
    <View>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        keyboardType={keyboard ?? 'default'}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'words'}
        style={[
          T.body,
          {
            marginTop: 8,
            height: 54,
            borderRadius: R.control,
            backgroundColor: C.wash,
            paddingHorizontal: 16,
            color: editable ? C.ink : C.muted,
          },
        ]}
      />
    </View>
  );
}

/** The API stores gender as a free string; the console writes these three. */
const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

const COUNTRY_OPTIONS: Option[] = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));
const countryFilter = (q: string): Option[] =>
  searchCountries(q).map((c) => ({ value: c.code, label: c.name }));

const MONTH_OPTIONS: Option[] = MONTH_NAMES.map((label, i) => ({ value: String(i + 1), label }));

/** Living memory, newest first — nobody scrolls up to find this year. */
const YEAR_OPTIONS: Option[] = Array.from({ length: 111 }, (_, i) => {
  const y = String(new Date().getFullYear() - i);
  return { value: y, label: y };
});

const pad = (v: string) => v.padStart(2, '0');

type Sheet = 'day' | 'month' | 'year' | 'nationality';

/** Personal details — first row on the profile screen. */
export default function EditDetails() {
  const router = useRouter();
  const { data, loading, error, signedOut, refresh } = useAsync(getProfile);

  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState<string | null>(null);
  const [email, setEmailValue] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  // Prefill once the profile lands. `data` is replaced wholesale on refresh, so
  // this re-seeds the form rather than fighting with what is being typed.
  useEffect(() => {
    if (!data) return;
    setName(data.fullName ?? '');
    setEmailValue(data.email ?? '');
    setGender((data.gender ?? '').toLowerCase());
    setNationality(data.nationality ? data.nationality.toUpperCase() : null);
    const [y, m, d] = (data.birthdate ?? '').slice(0, 10).split('-');
    setYear(y ?? '');
    // Stored zero-padded, offered unpadded — the options are keyed "1".."12".
    setMonth(m ? String(Number(m)) : '');
    setDay(d ? String(Number(d)) : '');
  }, [data]);

  // 29 February exists until a year says otherwise, so an unpicked year is
  // treated as a leap one and the day is only trimmed when it truly can't hold.
  const maxDay = month ? daysInMonth(year ? Number(year) : 2024, Number(month)) : 31;
  useEffect(() => {
    if (day && Number(day) > maxDay) setDay(String(maxDay));
  }, [day, maxDay]);

  const dayOptions = useMemo<Option[]>(
    () => Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    [maxDay],
  );

  const parts = [day, month, year];
  const complete = parts.every(Boolean);
  const birthdate = complete ? `${year}-${pad(month)}-${pad(day)}` : null;

  const clearBirthday = () => {
    setDay('');
    setMonth('');
    setYear('');
  };

  const save = async () => {
    if (!complete && parts.some(Boolean)) {
      setSaveError('Pick a day, a month and a year — or clear your birthday.');
      return;
    }
    if (birthdate && birthdate > new Date().toISOString().slice(0, 10)) {
      setSaveError('That birthday is in the future.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfile({
        fullName: name.trim(),
        gender,
        // Clearing a field clears what's stored; the API takes null for that.
        birthdate,
        nationality,
      });
      // Only when it changed: the endpoint rejects an address already in use,
      // and re-sending an unchanged one would fail for no reason.
      const trimmedEmail = email.trim();
      if (trimmedEmail !== (data?.email ?? '')) {
        await setEmail(trimmedEmail || null);
      }
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  };

  // Counted from the form, not from the server, so it falls as things are filled in.
  const left = [name.trim(), email.trim(), birthdate, gender, nationality].filter((v) => !v).length;

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Personal details</H1>
      <Lede style={{ marginTop: 10 }}>
        Your birthday unlocks a bonus every year. Everything on this screen is optional.
      </Lede>

      {loading ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          {left > 0 ? (
            <Small style={{ marginTop: 14 }}>
              {left === 1 ? '1 detail still to add.' : `${left} details still to add.`}
            </Small>
          ) : null}

          <View style={{ marginTop: 28, gap: 18 }}>
            <Field label="Full name" value={name} onChange={setName} placeholder="Your name" />

            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Label style={{ flex: 1 }}>Birthday</Label>
                {parts.some(Boolean) ? (
                  <Pressable onPress={clearBirthday} hitSlop={10}>
                    <Text style={{ fontFamily: font(600), fontSize: 12, lineHeight: 17, color: C.muted }}>
                      Clear
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 8 }}>
                <SelectField flex={1} value={day || null} placeholder="Day" onPress={() => setSheet('day')} />
                <SelectField flex={1.5} value={month ? MONTH_NAMES[Number(month) - 1]! : null} placeholder="Month" onPress={() => setSheet('month')} />
                <SelectField flex={1.1} value={year || null} placeholder="Year" onPress={() => setSheet('year')} />
              </View>
            </View>

            <View>
              <Label>Gender</Label>
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 8 }}>
                {GENDERS.map((g) => {
                  const on = gender === g.value;
                  return (
                    <Pressable
                      key={g.value}
                      // Tapping the selected option clears it — the field is optional.
                      onPress={() => setGender(on ? '' : g.value)}
                      style={({ pressed }) => [
                        {
                          flex: 1,
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: 48,
                          borderRadius: R.control,
                          backgroundColor: on ? C.ink : C.wash,
                        },
                        pressed ? { opacity: 0.85 } : null,
                      ]}
                    >
                      <Text style={{ fontFamily: font(600), fontSize: 13.5, lineHeight: 19, color: on ? '#fff' : C.ink }}>{g.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <SelectField
              label="Nationality"
              value={countryName(nationality)}
              placeholder="Search countries"
              onPress={() => setSheet('nationality')}
            />

            {/* Email has its own endpoint — it is hashed for lookup and
                encrypted at rest, which the profile PATCH does not do. The
                number stays read-only: it is what the account signs in with. */}
            <Field
              label="Email"
              value={email}
              onChange={setEmailValue}
              keyboard="email-address"
              placeholder="name@email.com"
            />
            <Field label="Phone" value={data?.phone ?? ''} editable={false} placeholder="Not set" />
          </View>

          {saveError ? (
            <Body style={{ marginTop: 20, color: S.spend }}>{saveError}</Body>
          ) : null}

          <Button
            label="Save changes"
            onPress={save}
            loading={saving}
            disabled={saving}
            style={{ marginTop: 28, borderRadius: R.card, height: 58 }}
          />
        </>
      )}

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

      {sheet === 'nationality' ? (
        <PickerSheet
          title="Nationality"
          options={COUNTRY_OPTIONS}
          value={nationality}
          onSelect={setNationality}
          onClose={() => setSheet(null)}
          searchable
          searchPlaceholder="Search countries"
          filter={countryFilter}
          clearLabel="Not set"
          onClear={() => setNationality(null)}
        />
      ) : null}
    </Screen>
  );
}
