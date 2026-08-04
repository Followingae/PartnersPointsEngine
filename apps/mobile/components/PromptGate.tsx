import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { getProfile } from '@/lib/api';
import { completion } from '@/lib/completion';
import { canShow, isProtectedRoute, noteLaunch } from '@/lib/prompts';
import { useSession } from '@/lib/session';

/**
 * Decides whether to interrupt someone, once, on a cold start.
 *
 * Everything about when lives in `lib/prompts`; this is the part that runs it
 * against the app's actual state. It fires at most one prompt in the life of
 * the process, and only when all of the following hold:
 *
 *  · Somebody is signed in, and this is not their first ever launch.
 *  · The profile genuinely has something outstanding.
 *  · That prompt is not snoozed or retired.
 *  · They are not part-way through scanning, redeeming or converting.
 *
 * Birthday and nationality are never raised on their own from a cold start —
 * the profile popup (84) is the only door in, and it names what is missing
 * rather than picking one thing and asking about it out of nowhere.
 */

/** Long enough for the first screen to settle so the modal isn't a flash. */
const SETTLE_MS = 1200;

export function PromptGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { signedIn, restoring } = useSession();
  const fired = useRef(false);
  // The route at the moment we decide — checked again before navigating,
  // because a customer can start scanning while the profile is loading.
  const route = useRef(pathname);
  route.current = pathname;

  useEffect(() => {
    if (restoring || !signedIn || fired.current) return;
    fired.current = true;

    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const { mayPrompt } = await noteLaunch();
        if (!alive || !mayPrompt) return;
        if (isProtectedRoute(route.current)) return;

        const profile = await getProfile();
        if (!alive) return;
        if (completion(profile).complete) return;

        if (!(await canShow('profile', route.current))) return;
        if (!alive || isProtectedRoute(route.current)) return;

        router.push('/prompts/profile');
      } catch {
        // A prompt is the least important thing the app does; if anything at
        // all goes wrong deciding whether to show one, don't.
      }
    }, SETTLE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [restoring, signedIn, router]);

  return null;
}
