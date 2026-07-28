import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SettingsHeader } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { BRAND, elevation, font } from '@/lib/tokens';

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const t = useTokens();
  return (
    <View>
      <Text style={{ fontFamily: font.sans(600), fontSize: 12, color: t.soft, marginBottom: 7 }}>{label}</Text>
      <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 15 }}>
        <Text style={{ fontFamily: font.sans(600), fontSize: 15, color: muted ? t.soft : t.ink }}>{value}</Text>
      </View>
    </View>
  );
}

export default function EditDetails() {
  const t = useTokens();
  const [gender, setGender] = useState('Female');
  return (
    <Screen>
      <SettingsHeader title="Personal details" />
      <View style={{ paddingHorizontal: 22, paddingTop: 18, gap: 16 }}>
        <Field label="FULL NAME" value="Maya Haddad" />
        <Field label="BIRTHDATE" value="14 March 1996" />
        <View>
          <Text style={{ fontFamily: font.sans(600), fontSize: 12, color: t.soft, marginBottom: 7 }}>GENDER</Text>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {['Female', 'Male', 'Other'].map((g) => {
              const on = gender === g;
              return (
                <Pressable
                  key={g}
                  onPress={() => setGender(g)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    backgroundColor: on ? BRAND.blue : t.card,
                    borderWidth: on ? 0 : 1,
                    borderColor: t.line,
                    paddingVertical: 13,
                    borderRadius: 14,
                  }}
                >
                  <Text style={{ fontFamily: font.sans(on ? 700 : 600), fontSize: 13, color: on ? '#fff' : t.ink }}>{g}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Field label="EMAIL" value="maya.h@email.com" />
        <Field label="PHONE" value="+971 50 123 4567" muted />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 30 }}>
        {/* TODO(api): save profile */}
        <Pressable style={[{ backgroundColor: BRAND.blue, borderRadius: 18, paddingVertical: 17, alignItems: 'center' }, elevation('rgba(11,4,217,0.4)')]}>
          <Text style={{ fontFamily: font.sans(700), fontSize: 16, color: '#fff' }}>Save changes</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
