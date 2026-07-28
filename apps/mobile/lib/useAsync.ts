import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';

export interface AsyncState<T> {
  data: T | undefined;
  /** First load only, so a pull-to-refresh doesn't blank the screen. */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** True when the session was rejected — the caller should route to sign-in. */
  signedOut: boolean;
  refresh: () => void;
  /** Replace the data locally after a mutation, without a round trip. */
  set: (updater: (prev: T | undefined) => T | undefined) => void;
}

/**
 * Runs a fetch and tracks its state.
 *
 * Deliberately small — the app's screens are read-mostly and each owns one
 * request, so a cache layer would add more than it saves. Results arriving
 * after unmount (or after a newer request) are dropped rather than applied.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const alive = useRef(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (isRefresh: boolean) => {
    const mine = ++seq.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (!alive.current || mine !== seq.current) return;
      setData(result);
      setSignedOut(false);
    } catch (e) {
      if (!alive.current || mine !== seq.current) return;
      if (e instanceof ApiError && e.isAuth) setSignedOut(true);
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      if (alive.current && mine === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => {
    void run(true);
  }, [run]);

  const set = useCallback((updater: (prev: T | undefined) => T | undefined) => {
    setData((prev) => updater(prev));
  }, []);

  return { data, loading, refreshing, error, signedOut, refresh, set };
}
