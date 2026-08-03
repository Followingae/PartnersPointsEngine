import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BackBar, Lede, ListRow, Toggle } from '@/components/Bits';
import { Body, ErrorState, H1, Label, Loading, Screen, Small } from '@/components/UI';
import { getSessions, revokeSession, type WalletSession } from '@/lib/api';
import { dateTimeLabel } from '@/lib/dates';
import { lockEnabled, lockSupport, setLockEnabled, unlock, type LockSupport } from '@/lib/lock';
import { useAsync } from '@/lib/useAsync';
import { C, S } from '@/lib/tokens';

/**
 * Security — the app lock, and the devices holding a live session.
 *
 * Both halves are real, which is the point: the toggle drives the same
 * preference the lock gate reads, and the device list is the wallet's own
 * refresh tokens. It used to show two invented devices, which is worse than
 * showing none — anyone checking for a device they didn't recognise would have
 * found one every single time.
 */

/** Two facts a stranger's phone fails: when it was last used, and whose it is. */
function sessionSub(s: WalletSession): string {
  const seen = dateTimeLabel(s.lastSeenAt);
  return s.current ? `This device · ${seen}` : `Last used ${seen}`;
}

export default function Security() {
  const router = useRouter();
  const [support, setSupport] = useState<LockSupport | null>(null);
  const [lock, setLock] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const sessions = useAsync(getSessions, []);
  const [ending, setEnding] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  useEffect(() => {
    if (sessions.signedOut) router.replace('/onboarding/phone');
  }, [sessions.signedOut, router]);

  useEffect(() => {
    let alive = true;
    void Promise.all([lockSupport(), lockEnabled()]).then(([s, on]) => {
      if (!alive) return;
      setSupport(s);
      // A lock the hardware can no longer satisfy is not a lock — show it off,
      // because that is what the gate will do on the next cold start.
      setLock(on && s.usable);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleLock = useCallback(async () => {
    if (!support?.usable) return;
    setLockError(null);
    if (lock) {
      await setLockEnabled(false);
      setLock(false);
      return;
    }
    // Prove it before storing it — the same prompt the gate will use.
    const ok = await unlock(`Turn on ${support.label}`);
    if (!ok) {
      setLockError(`${support.label} didn’t confirm, so the lock is still off.`);
      return;
    }
    await setLockEnabled(true);
    setLock(true);
  }, [lock, support]);

  const end = useCallback(
    async (s: WalletSession) => {
      if (s.current || ending) return;
      setEnding(s.id);
      setEndError(null);
      try {
        await revokeSession(s.id);
        await sessions.refresh();
      } catch (e) {
        setEndError(e instanceof Error ? e.message : 'Could not sign that device out.');
      } finally {
        setEnding(null);
      }
    },
    [ending, sessions],
  );

  const lockLabel = support?.label ?? 'Face ID';

  return (
    <Screen refreshing={sessions.refreshing} onRefresh={sessions.refresh}>
      <BackBar fallback="/profile" />

      <H1 style={{ marginTop: 20 }}>Security</H1>
      <Lede style={{ marginTop: 10 }}>The app lock, and the devices signed in to your account.</Lede>

      <View style={{ marginTop: 24 }}>
        <ListRow
          title={`${lockLabel} unlock`}
          sub={
            support === null
              ? 'Checking this device'
              : support.usable
                ? `Ask for ${lockLabel} when you open the app`
                : support.needsEnrolment
                  ? `Set ${lockLabel} up in your device settings first`
                  : 'This device has no biometric unlock'
          }
          {...(support?.usable ? { onPress: () => void toggleLock() } : {})}
          trailing={<Toggle on={lock} />}
        />
        <ListRow
          divider
          title="Change phone number"
          sub="Your number is your account — contact support to move it"
        />
      </View>

      {lockError ? <Body style={{ marginTop: 14, color: S.spend }}>{lockError}</Body> : null}

      <View style={{ marginTop: 30 }}>
        <Label>Devices</Label>

        {sessions.loading ? (
          <Loading />
        ) : sessions.error && !sessions.data ? (
          <ErrorState message={sessions.error} onRetry={sessions.refresh} />
        ) : (
          <View style={{ marginTop: 8 }}>
            {(sessions.data ?? []).map((s, i) => (
              <ListRow
                key={s.id}
                divider={i > 0}
                title={s.device}
                sub={sessionSub(s)}
                trailing={
                  s.current ? (
                    <Small style={{ fontSize: 12.5, lineHeight: 18, color: C.faint }}>Current</Small>
                  ) : (
                    <Pressable onPress={() => void end(s)} hitSlop={8} disabled={ending === s.id}>
                      <Text
                        style={{
                          fontSize: 12.5,
                          lineHeight: 18,
                          color: ending === s.id ? C.faint : S.spend,
                        }}
                      >
                        {ending === s.id ? 'Signing out…' : 'Sign out'}
                      </Text>
                    </Pressable>
                  )
                }
              />
            ))}
          </View>
        )}

        {endError ? <Body style={{ marginTop: 14, color: S.spend }}>{endError}</Body> : null}

        <Small style={{ marginTop: 14, color: C.faint }}>
          Signing out a device does not affect your points.
        </Small>
      </View>
    </Screen>
  );
}
