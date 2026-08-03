import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, Text, View, type AppStateStatus } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useSession } from '@/lib/session';
import { lockEnabled, unlock } from '@/lib/lock';
import { C, font } from '@/lib/tokens';

/**
 * Face ID in front of the wallet, when the customer has asked for it.
 *
 * It covers rather than unmounts: the screen underneath keeps its state, so
 * unlocking puts someone back exactly where they were instead of restarting
 * them at the wallet. The cover goes up the instant the app leaves the
 * foreground — including the app switcher, which is the one place a balance
 * would otherwise be visible to whoever picked up the phone.
 *
 * A short grace period means glancing at a notification doesn't cost a face
 * scan; anything longer than that is treated as putting the phone down.
 */
const GRACE_MS = 30_000;

function LockScreen({ onUnlock, busy }: { onUnlock: () => void; busy: boolean }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: C.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
      }}
    >
      <View
        style={{
          width: 92,
          height: 92,
          borderRadius: 28,
          backgroundColor: C.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={5} y={10} width={14} height={10} rx={2} />
          <Path d="M8 10V8a4 4 0 0 1 8 0v2" />
        </Svg>
      </View>

      <Pressable onPress={busy ? undefined : onUnlock} hitSlop={12}>
        <Text style={{ fontFamily: font(600), fontSize: 15, lineHeight: 21, color: C.muted }}>
          {busy ? 'Waiting…' : 'Unlock'}
        </Text>
      </Pressable>
    </View>
  );
}

export function LockGate({ children }: { children: ReactNode }) {
  const { signedIn, restoring } = useSession();
  const [armed, setArmed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const leftAt = useRef<number | null>(null);

  // Read the preference once the session is known — a lock means nothing to
  // someone who isn't signed in, and the first frame shouldn't guess.
  useEffect(() => {
    if (restoring) return;
    let alive = true;
    void lockEnabled().then((on) => {
      if (!alive) return;
      setArmed(on);
      if (on && signedIn) setLocked(true);
    });
    return () => {
      alive = false;
    };
  }, [restoring, signedIn]);

  // A ref, not the state — the AppState listener holds one closure for its whole
  // life and would otherwise re-enter with a stale `busy`, stacking prompts.
  const asking = useRef(false);

  const ask = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    setBusy(true);
    const ok = await unlock();
    asking.current = false;
    setBusy(false);
    if (ok) setLocked(false);
  }, []);

  useEffect(() => {
    if (!armed || !signedIn) return;

    // The cold-start lock is already up; ask for it now that we're in the
    // foreground. Prompting while backgrounded leaves a dialog nobody sees.
    if (AppState.currentState === 'active') void ask();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        const away = leftAt.current === null ? 0 : Date.now() - leftAt.current;
        leftAt.current = null;
        // A glance at a notification isn't putting the phone down.
        if (away <= GRACE_MS) setLocked(false);
        else void ask();
      } else {
        // Cover it before the OS takes its app-switcher snapshot.
        if (leftAt.current === null) leftAt.current = Date.now();
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [armed, signedIn, ask]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {armed && signedIn && locked ? <LockScreen onUnlock={() => void ask()} busy={busy} /> : null}
    </View>
  );
}
