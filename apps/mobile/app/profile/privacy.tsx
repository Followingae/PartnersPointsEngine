import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { BackBar, Icon, Lede, ListRow, Tile, Toggle } from '@/components/Bits';
import { H1, Label, Screen, Small } from '@/components/UI';
import { cancelDeletion, getDeletionStatus, requestDeletion, type DeletionStatus } from '@/lib/api';
import { shortDate } from '@/lib/dates';
import { C, S, font } from '@/lib/tokens';

/**
 * 57 · Privacy and data.
 *
 * The deletion control here is not a support request. Apple and Google both
 * require a customer to start *and* finish deleting their account without
 * anyone at our end being involved, so this schedules a real deletion that
 * completes on its own. The notice period exists so the team can ring about
 * unspent points — not so they can approve it.
 */
export default function Privacy() {
  const [personalised, setPersonalised] = useState(true);
  const [share, setShare] = useState(false);

  const [deletion, setDeletion] = useState<DeletionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getDeletionStatus()
      .then(setDeletion)
      // A failed status read must not present a broken control: leaving it null
      // hides the row rather than offering a delete that would not work.
      .catch(() => setDeletion(null));
  }, []);

  useEffect(load, [load]);

  const notice = deletion?.noticeDays ?? 30;

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      `Your profile and personal details will be permanently removed after ${notice} days. `
        + 'Any points you have not spent will be lost.\n\n'
        + 'You can cancel any time before then.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            requestDeletion()
              .then(setDeletion)
              .catch(() =>
                Alert.alert('That didn’t go through', 'Check your connection and try again.'),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  function keepAccount() {
    setBusy(true);
    cancelDeletion()
      .then(load)
      .catch(() => Alert.alert('That didn’t go through', 'Check your connection and try again.'))
      .finally(() => setBusy(false));
  }

  const pending = deletion?.pending === true;

  return (
    <Screen>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Privacy and data</H1>
      <Lede style={{ marginTop: 10 }}>What we use your activity for, and how to take it back.</Lede>

      <View style={{ marginTop: 24 }}>
        <ListRow
          title="Personalised offers"
          sub="Use my activity to tailor offers"
          onPress={() => setPersonalised((v) => !v)}
          trailing={<Toggle on={personalised} />}
        />
        <ListRow
          title="Share data with merchants"
          sub="Let merchants see your tier"
          onPress={() => setShare((v) => !v)}
          trailing={<Toggle on={share} />}
        />
      </View>

      <View style={{ marginTop: 30 }}>
        <Label>Your data</Label>

        <View style={{ marginTop: 8 }}>
          {pending ? (
            <ListRow
              lead={<Tile background="rgba(255,31,107,.12)"><Icon name="lock" size={19} color={S.spend} /></Tile>}
              title="Deletion scheduled"
              sub={
                deletion?.scheduledFor
                  ? `Your account is removed on ${shortDate(deletion.scheduledFor)}`
                  : `Your account is removed in ${notice} days`
              }
              onPress={busy ? undefined : keepAccount}
              trailing={
                busy ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: C.ink }}>
                    Keep
                  </Text>
                )
              }
            />
          ) : deletion ? (
            <ListRow
              lead={<Tile background="rgba(255,31,107,.12)"><Icon name="lock" size={19} color={S.spend} /></Tile>}
              title="Delete my account"
              sub="Removes your profile and unspent points"
              onPress={busy ? undefined : confirmDelete}
              trailing={
                busy ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ fontFamily: font(600), fontSize: 13, lineHeight: 18, color: S.spend }}>
                    Delete
                  </Text>
                )
              }
            />
          ) : null}
        </View>

        <Small style={{ marginTop: 14, color: C.faint }}>
          {pending
            ? 'Tap Keep to cancel. After the date above, your details cannot be recovered.'
            : `Deletion is permanent and takes ${notice} days to complete. You can cancel during that time.`}
        </Small>
      </View>
    </Screen>
  );
}
