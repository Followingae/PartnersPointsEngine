import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TextInput, View } from 'react-native';
import { PromptSheet } from '@/components/PromptSheet';
import { Small } from '@/components/UI';
import { setEmail } from '@/lib/api';
import { markShown, settle } from '@/lib/prompts';
import { C, R, font } from '@/lib/tokens';

/**
 * 81 · Email at redemption.
 *
 * Asked at the one moment it is obviously useful — a voucher has just been
 * issued and the customer is deciding how to carry it. Never on a cold start:
 * "what is your email" out of nowhere is a form, but "shall I send you this?"
 * is an offer.
 *
 * Skipping is a first-class outcome, so the secondary action says what happens
 * rather than "no".
 */
export default function EmailPrompt() {
  const router = useRouter();
  const { voucherId } = useLocalSearchParams<{ voucherId?: string }>();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    markShown();
  }, []);

  const id = Array.isArray(voucherId) ? voucherId[0] : voucherId;
  const onward = () => router.replace(id ? `/voucher/${id}` : '/vouchers');

  async function save() {
    const email = value.trim();
    if (!email) return;
    setSaving(true);
    setFailed(null);
    try {
      await setEmail(email);
      await settle('email');
      onward();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save that address.');
      setSaving(false);
    }
  }

  return (
    <PromptSheet
      title="Send this voucher by email?"
      body="It stays in the app either way — this is just a copy you can find later."
      primaryLabel="Send and continue"
      onPrimary={save}
      primaryLoading={saving}
      primaryDisabled={!value.trim() || saving}
      secondaryLabel="Just show the voucher"
      onSecondary={() => {
        void settle('email');
        onward();
      }}
      onDismiss={onward}
    >
      <View>
        <TextInput
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setFailed(null);
          }}
          onSubmitEditing={save}
          placeholder="name@email.com"
          placeholderTextColor={C.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          editable={!saving}
          style={{
            height: 56,
            borderRadius: R.tile,
            backgroundColor: C.canvas,
            paddingHorizontal: 18,
            fontFamily: font(600),
            fontSize: 16,
            lineHeight: 22,
            color: C.ink,
          }}
        />
        {failed ? (
          <Small style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18, color: C.crimson }}>{failed}</Small>
        ) : null}
      </View>
    </PromptSheet>
  );
}
