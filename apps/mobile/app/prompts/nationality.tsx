import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { PromptSheet } from '@/components/PromptSheet';
import { PickerSheet, type Option } from '@/components/Picker';
import { getProfile, updateProfile } from '@/lib/api';
import { COUNTRIES, countryName, searchCountries } from '@/lib/countries';
import { dismiss, markShown, settle } from '@/lib/prompts';
import { useAsync } from '@/lib/useAsync';
import { C, R, font } from '@/lib/tokens';

/**
 * 85 · Nationality prompt.
 *
 * Five chips cover most of who walks into a UAE shop, and the full list is one
 * tap away — a picker of 249 countries as the opening move is a wall.
 *
 * Reached only from the profile popup or the checklist, never on its own from
 * a cold start: it is the least urgent of the six and does not deserve to be
 * the first thing somebody sees.
 */
const QUICK = ['LB', 'AE', 'IN', 'EG', 'GB', 'PH'];

const OPTIONS: Option[] = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));
const filter = (q: string): Option[] => searchCountries(q).map((c) => ({ value: c.code, label: c.name }));

export default function NationalityPrompt() {
  const router = useRouter();
  const { data } = useAsync(getProfile, []);
  const [choice, setChoice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    markShown();
  }, []);

  useEffect(() => {
    if (data?.nationality) setChoice(data.nationality.toUpperCase());
  }, [data]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  async function save() {
    if (!choice) return;
    setSaving(true);
    setFailed(null);
    try {
      await updateProfile({ nationality: choice });
      await settle('nationality');
      router.replace({ pathname: '/prompts/saved', params: { what: 'Nationality' } });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save that.');
      setSaving(false);
    }
  }

  return (
    <>
      <PromptSheet
        title="Where are you from?"
        body="Brands use this to plan menus and stock. Never shown to other customers."
        primaryLabel="Save"
        onPrimary={save}
        primaryLoading={saving}
        primaryDisabled={!choice || saving}
        secondaryLabel="Skip"
        onSecondary={() => {
          void dismiss('nationality', true);
          close();
        }}
        onDismiss={() => {
          void dismiss('nationality');
          close();
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {QUICK.map((code) => {
            const on = choice === code;
            return (
              <Pressable
                key={code}
                onPress={() => setChoice(code)}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 15,
                    paddingVertical: 10,
                    borderRadius: R.chip,
                    backgroundColor: on ? C.ink : C.canvas,
                  },
                  pressed ? { opacity: 0.8 } : null,
                ]}
              >
                <Text style={{ fontFamily: font(600), fontSize: 13.5, lineHeight: 19, color: on ? '#fff' : C.ink }}>
                  {countryName(code)}
                </Text>
              </Pressable>
            );
          })}

          {/* The other 243. */}
          <Pressable
            onPress={() => setPicking(true)}
            style={({ pressed }) => [
              {
                paddingHorizontal: 15,
                paddingVertical: 10,
                borderRadius: R.chip,
                borderWidth: 1.5,
                borderColor: C.hairline,
              },
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={{ fontFamily: font(600), fontSize: 13.5, lineHeight: 19, color: C.muted }}>
              {choice && !QUICK.includes(choice) ? countryName(choice) : 'Somewhere else'}
            </Text>
          </Pressable>
        </View>

        {failed ? (
          <Text style={{ marginTop: 12, fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.crimson }}>
            {failed}
          </Text>
        ) : null}
      </PromptSheet>

      {picking ? (
        <PickerSheet
          title="Nationality"
          options={OPTIONS}
          value={choice}
          onSelect={setChoice}
          onClose={() => setPicking(false)}
          searchable
          searchPlaceholder="Search countries"
          filter={filter}
        />
      ) : null}
    </>
  );
}
