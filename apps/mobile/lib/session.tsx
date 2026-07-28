import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearSession, getWalletToken, verifyOtp as verifyOtpApi } from '@/lib/api';

/**
 * Who is signed in, for the whole app.
 *
 * `restoring` exists so the first frame doesn't guess: routing a returning user
 * to onboarding before storage has been read would sign them out visually every
 * cold start.
 */
interface SessionValue {
  signedIn: boolean;
  restoring: boolean;
  signIn: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let alive = true;
    getWalletToken()
      .then((t) => {
        if (alive) setSignedIn(Boolean(t));
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (phone: string, code: string) => {
    await verifyOtpApi(phone, code);
    setSignedIn(true);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setSignedIn(false);
  }, []);

  const value = useMemo(
    () => ({ signedIn, restoring, signIn, signOut }),
    [signedIn, restoring, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession used outside SessionProvider');
  return v;
}
