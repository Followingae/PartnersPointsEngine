/**
 * What the customer hasn't seen yet.
 *
 * There is no notification service and no read/unread state on the server, so
 * "unread" is answered the only honest way available: the newest thing worth
 * telling them about, against the last time they opened the screen. Opening it
 * marks everything up to that moment seen.
 *
 * Kept on the device deliberately. A server-side read state would need a write
 * on every glance, and getting it wrong means either a badge that never clears
 * or one that clears on a phone the customer isn't holding.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'rfm.notifications.seenAt';

/** The timestamp of the newest item the customer has actually looked at. */
export async function lastSeen(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export const markSeen = (at: number = Date.now()): Promise<void> =>
  AsyncStorage.setItem(KEY, String(at));

/**
 * How many of `times` are newer than the last look.
 *
 * Returns 0 until storage has been read, so the badge appears when there is
 * genuinely something new rather than flashing on every mount.
 */
export function useUnreadCount(times: readonly string[]): number {
  const [seenAt, setSeenAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void lastSeen().then((v) => {
      if (alive) setSeenAt(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (seenAt === null) return 0;
  return times.filter((t) => {
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) && ms > seenAt;
  }).length;
}

/** Marks everything seen, and hands back a callback for screens that need it. */
export function useMarkSeen(): () => void {
  return useCallback(() => {
    void markSeen();
  }, []);
}
