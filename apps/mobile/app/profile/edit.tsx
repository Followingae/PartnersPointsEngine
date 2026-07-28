import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BackBar, Lede } from '@/components/Bits';
import { Button, H1, Label, Screen } from '@/components/UI';
import { C, R, T, font } from '@/lib/tokens';

function Field({
  label, value, onChange, editable = true, keyboard,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
  keyboard?: 'default' | 'email-address';
}) {
  return (
    <View>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        keyboardType={keyboard ?? 'default'}
        placeholderTextColor={C.faint}
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

const GENDERS = ['Female', 'Male', 'Other'];

/** Personal details — first row on the profile screen. */
export default function EditDetails() {
  const router = useRouter();

  // TODO(api): GET/PATCH /customer/me
  const [name, setName] = useState('Maya Khoury');
  const [birthday, setBirthday] = useState('14 March 1996');
  const [email, setEmail] = useState('maya.h@email.com');
  const [gender, setGender] = useState(GENDERS[0]);

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Personal details</H1>
      <Lede style={{ marginTop: 10 }}>Your birthday unlocks a bonus every year.</Lede>

      <View style={{ marginTop: 28, gap: 18 }}>
        <Field label="Full name" value={name} onChange={setName} />
        <Field label="Birthday" value={birthday} onChange={setBirthday} />

        <View>
          <Label>Gender</Label>
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 8 }}>
            {GENDERS.map((g) => {
              const on = gender === g;
              return (
                <Pressable
                  key={g}
                  onPress={() => setGender(g)}
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
                  <Text style={{ fontFamily: font(600), fontSize: 13.5, lineHeight: 19, color: on ? '#fff' : C.ink }}>{g}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Field label="Email" value={email} onChange={setEmail} keyboard="email-address" />
        <Field label="Phone" value="+971 50 123 4567" editable={false} />
      </View>

      <Button
        label="Save changes"
        onPress={() => router.back()}
        style={{ marginTop: 28, borderRadius: R.card, height: 58 }}
      />
    </Screen>
  );
}
