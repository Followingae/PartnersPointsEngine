/**
 * The app lock — Face ID, Touch Id or the device passcode in front of the wallet.
 *
 * This is a device-local gate, not an authentication factor: the session token
 * is what the API trusts, and this only decides whether the person holding the
 * phone gets to see it. That distinction matters for the failure case — if the
 * hardware can't answer (no enrolment, an OS that refuses), the honest thing is
 * to turn the lock off rather than to strand someone outside their own wallet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const KEY = 'rfm.lock.enabled';

/** What this device can actually do, and what to call it on screen. */
export interface LockSupport {
  /** Hardware exists and something is enrolled — the lock can be turned on. */
  usable: boolean;
  /** Hardware exists but nothing is enrolled yet. */
  needsEnrolment: boolean;
  /** "Face ID", "Touch ID", "fingerprint"… — never a guess from the platform alone. */
  label: string;
}

const FALLBACK_LABEL = Platform.OS === 'ios' ? 'Face ID' : 'biometric unlock';

export async function lockSupport(): Promise<LockSupport> {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const { FACIAL_RECOGNITION, FINGERPRINT, IRIS } = LocalAuthentication.AuthenticationType;
    const label = types.includes(FACIAL_RECOGNITION)
      ? Platform.OS === 'ios'
        ? 'Face ID'
        : 'face unlock'
      : types.includes(FINGERPRINT)
        ? Platform.OS === 'ios'
          ? 'Touch ID'
          : 'fingerprint'
        : types.includes(IRIS)
          ? 'iris unlock'
          : FALLBACK_LABEL;
    return { usable: hardware && enrolled, needsEnrolment: hardware && !enrolled, label };
  } catch {
    return { usable: false, needsEnrolment: false, label: FALLBACK_LABEL };
  }
}

export const lockEnabled = (): Promise<boolean> => AsyncStorage.getItem(KEY).then((v) => v === '1');

export const setLockEnabled = (on: boolean): Promise<void> =>
  AsyncStorage.setItem(KEY, on ? '1' : '0');

/**
 * Ask for the unlock. The device passcode is allowed as a fallback so a failed
 * face scan isn't a locked-out phone.
 */
export async function unlock(prompt = 'Unlock your wallet'): Promise<boolean> {
  try {
    const { success } = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return success;
  } catch {
    return false;
  }
}
