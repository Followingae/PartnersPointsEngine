import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { getAppStatus } from '@/lib/api';

/**
 * Checks, once per launch, that this build should be running at all.
 *
 * Two outcomes stop the app: the ledger no longer answers this version
 * (68 · Update required), or it is not answering anyone right now
 * (67 · Maintenance). Everything else — including this check failing — lets
 * the app carry on, because a status endpoint that is itself unreachable is
 * not grounds for blocking somebody from their own loyalty card.
 */

/** "1.2.3" → comparable. Missing parts count as zero. */
function older(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
}

export function StatusGate() {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    setChecked(true);
    let alive = true;

    void (async () => {
      try {
        const status = await getAppStatus();
        if (!alive) return;
        // Already on one of these — don't bounce it onto itself.
        if (pathname === '/update-required' || pathname === '/maintenance') return;

        const version = Constants.expoConfig?.version ?? '0.0.0';
        if (status.minVersion && older(version, status.minVersion)) {
          router.replace('/update-required');
          return;
        }
        if (status.maintenance) router.replace('/maintenance');
      } catch {
        /* unreachable status is not a reason to lock anyone out */
      }
    })();

    return () => {
      alive = false;
    };
  }, [checked, pathname, router]);

  return null;
}
