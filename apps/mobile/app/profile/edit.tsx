import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BackBar, Lede } from '@/components/Bits';
import { Body, Button, ErrorState, H1, Label, Loading, Screen } from '@/components/UI';
import { getProfile, updateProfile } from '@/lib/api';
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Personal details — first row on the profile screen. */
export default function EditDetails() {
  const router = useRouter();
  const { data, loading, error, signedOut, refresh } = useAsync(getProfile);

  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState('');
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
    setBirthdate(data.birthdate ? data.birthdate.slice(0, 10) : '');
    setGender((data.gender ?? '').toLowerCase());
  }, [data]);

  const save = async () => {
    const trimmed = birthdate.trim();
    if (trimmed && !ISO_DATE.test(trimmed)) {
      setSaveError('Enter your birthday as YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfile({
        fullName: name.trim(),
        gender,
        // Clearing the field clears the stored date; the API takes null for that.
        birthdate: trimmed || null,
      });
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Personal details</H1>
      <Lede style={{ marginTop: 10 }}>Your birthday unlocks a bonus every year.</Lede>

      {loading ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <View style={{ marginTop: 28, gap: 18 }}>
            <Field label="Full name" value={name} onChange={setName} placeholder="Your name" />
            <Field
              label="Birthday"
              value={birthdate}
              onChange={setBirthdate}
              keyboard="numbers-and-punctuation"
              placeholder="YYYY-MM-DD"
            />

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

            {/* Email and phone are read-only here: the wallet profile endpoint
                takes neither, and the number is what the account signs in with. */}
            <Field label="Email" value={data?.email ?? ''} editable={false} keyboard="email-address" placeholder="Not set" />
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
    </Screen>
  );
}
