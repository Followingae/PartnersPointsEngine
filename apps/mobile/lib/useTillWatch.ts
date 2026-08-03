/**
 * Watching for the points the till is about to add.
 *
 * The earn happens at the till, not in the app: the cashier scans the code and
 * the terminal posts it. Nothing tells the phone, so while someone is holding
 * their code up we look — the activity feed is the same one the rest of the app
 * reads, and a new event on it is the till having done its part.
 *
 * Only events that appear *after* the screen opened count. Baselining against
 * what was already there is what keeps this from celebrating last week's coffee
 * every time the code is shown.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { getActivity, type ActivityEvent } from '@/lib/api';

/** Often enough to feel immediate at a counter, rare enough to be unnoticeable. */
const EVERY_MS = 4_000;

/** Nobody stands at a till for ten minutes; stop rather than poll forever. */
const GIVE_UP_MS = 10 * 60_000;

export interface TillEvents {
  /** The earn the till just posted. */
  earned: ActivityEvent | undefined;
  /** A redemption in the same breath — points came off the bill. */
  spent: ActivityEvent | undefined;
}

export function useTillWatch(enabled: boolean, onLanded: (e: TillEvents) => void): void {
  // The callback changes every render in most callers; a ref keeps the polling
  // effect from tearing down and re-baselining each time.
  const handler = useRef(onLanded);
  useEffect(() => {
    handler.current = onLanded;
  }, [onLanded]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      let alive = true;
      let baseline: Set<string> | null = null;
      const startedAt = Date.now();

      const tick = async () => {
        if (!alive) return;
        let feed: ActivityEvent[];
        try {
          feed = await getActivity(10);
        } catch {
          // A dropped poll is not worth surfacing — the next one is 4s away,
          // and the screen's own error state covers a session that has ended.
          return;
        }
        if (!alive) return;

        if (baseline === null) {
          baseline = new Set(feed.map((e) => e.id));
          return;
        }

        const fresh = feed.filter((e) => !baseline!.has(e.id));
        if (fresh.length === 0) return;
        for (const e of fresh) baseline.add(e.id);

        const earned = fresh.find((e) => e.type === 'earn' && e.direction === 'credit');
        const spent = fresh.find((e) => e.direction === 'debit' && (e.type === 'redeem' || e.type === 'voucher_redeemed'));
        if (!earned && !spent) return;

        alive = false;
        handler.current({ earned, spent });
      };

      void tick();
      const id = setInterval(() => {
        if (Date.now() - startedAt > GIVE_UP_MS) {
          clearInterval(id);
          return;
        }
        void tick();
      }, EVERY_MS);

      return () => {
        alive = false;
        clearInterval(id);
      };
    }, [enabled]),
  );
}
