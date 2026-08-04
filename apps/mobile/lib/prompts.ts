/**
 * When the app is allowed to interrupt someone.
 *
 * A prompt that asks at the wrong moment is worse than one that never asks:
 * the customer is at a till, or mid-redemption, and the thing in front of them
 * is a question about their birthday. So the rules are strict and they live in
 * one place rather than being re-decided by each caller.
 *
 *  · One interruption per session. Ever. If something has already been shown,
 *    nothing else will be.
 *  · Cold start only, and never the very first launch — someone who signed up
 *    ninety seconds ago is not owed a form.
 *  · Never while scanning, redeeming or converting. Those flows end with money
 *    or points moving and must not be interrupted.
 *  · Dismiss snoozes for a week; dismissing the same prompt again makes it a
 *    month; three dismissals retires it for good and leaves only the quiet
 *    meter as a way back in.
 *
 * State is per device, in storage. There is no server-side notion of "asked",
 * and inventing one would mean a prompt that stays snoozed on a phone the
 * customer no longer uses.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PromptKey = 'profile' | 'nationality' | 'birthday' | 'home-branch' | 'email';

const KEY = (k: PromptKey) => `rfm.prompt.${k}`;
const LAUNCHES = 'rfm.prompt.launches';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/** Retired after this many dismissals — see 88 · Snoozed state. */
const RETIRE_AFTER = 3;

interface PromptState {
  /** When it may next be shown. */
  snoozedUntil: number;
  /** How many times the customer has waved it away. */
  dismissals: number;
  /** Answered, or explicitly finished — never ask again. */
  settled: boolean;
}

const EMPTY: PromptState = { snoozedUntil: 0, dismissals: 0, settled: false };

async function read(k: PromptKey): Promise<PromptState> {
  try {
    const raw = await AsyncStorage.getItem(KEY(k));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<PromptState>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const write = (k: PromptKey, s: PromptState) => AsyncStorage.setItem(KEY(k), JSON.stringify(s));

/**
 * One interruption per app session.
 *
 * Module state, not storage: it should reset when the process does, which is
 * exactly what "per session" means.
 */
let shownThisSession = false;

/** Flows that must never be interrupted. Checked by route prefix. */
const PROTECTED = ['/scan', '/rewards', '/voucher', '/convert', '/join'];

export const isProtectedRoute = (path: string | null | undefined): boolean =>
  Boolean(path) && PROTECTED.some((p) => path!.startsWith(p));

/**
 * Counts this launch and reports whether prompts are allowed at all yet.
 *
 * The first ever cold start returns false: nothing is asked of someone who has
 * only just arrived. From the second, prompting may begin.
 */
export async function noteLaunch(): Promise<{ launches: number; mayPrompt: boolean }> {
  let launches = 1;
  try {
    const raw = await AsyncStorage.getItem(LAUNCHES);
    launches = (raw ? Number(raw) || 0 : 0) + 1;
    await AsyncStorage.setItem(LAUNCHES, String(launches));
  } catch {
    /* a device that cannot count launches simply never prompts */
    return { launches: 1, mayPrompt: false };
  }
  return { launches, mayPrompt: launches >= 2 };
}

/** May this specific prompt be shown right now? */
export async function canShow(k: PromptKey, route?: string | null): Promise<boolean> {
  if (shownThisSession) return false;
  if (isProtectedRoute(route)) return false;
  const s = await read(k);
  if (s.settled) return false;
  if (s.dismissals >= RETIRE_AFTER) return false;
  return Date.now() >= s.snoozedUntil;
}

/** Marks the one interruption this session as spent. */
export function markShown(): void {
  shownThisSession = true;
}

/** "Remind me next week" and the dismiss ×, which escalate the same way. */
export async function dismiss(k: PromptKey, explicitWeek = false): Promise<void> {
  const s = await read(k);
  const dismissals = s.dismissals + 1;
  const until = explicitWeek
    ? Date.now() + WEEK
    : Date.now() + (dismissals >= 2 ? MONTH : WEEK);
  await write(k, { ...s, dismissals, snoozedUntil: until });
}

/** Answered — or the customer said they were done with it. */
export async function settle(k: PromptKey): Promise<void> {
  const s = await read(k);
  await write(k, { ...s, settled: true });
}

/** Only for tests and the "start again" affordance. */
export async function reset(k: PromptKey): Promise<void> {
  await AsyncStorage.removeItem(KEY(k));
}
