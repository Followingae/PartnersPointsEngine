import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Customer API client for the Partners Points mobile app.
 *
 * NOTE: the backend customer token is per-brand (closed-loop). A cross-merchant
 * "list my wallets" surface needs a small platform-level addition (tracked in
 * task #86); multi-wallet screens use sample data until then.
 */
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/v1';
const TOKEN_KEY = 'pp_customer_token';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(t: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, t);
}
export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(err?.message ?? json?.message ?? `Request failed (${res.status})`, res.status, err?.code, err?.details);
  }
  return json as T;
}

// ── Auth (phone OTP) ──────────────────────────────────────────────────────
export const requestOtp = (phone: string) =>
  api('/customer/auth/otp', { method: 'POST', body: JSON.stringify({ phone }) });
export const verifyOtp = (phone: string, code: string, brandId: string) =>
  api<{ accessToken?: string; token?: string }>('/customer/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code, brandId }),
  });

// ── Convert to Lulu (partnerships) ─────────────────────────────────────────
export const linkPartner = (partnerKey: string, memberRef: string) =>
  api('/customer/partners/link', { method: 'POST', body: JSON.stringify({ partnerKey, memberRef }) });
export const previewConvert = (sourcePoints: number) =>
  api('/customer/partners/preview', { method: 'POST', body: JSON.stringify({ sourcePoints }) });
export const convert = (sourcePoints: number, idempotencyKey: string) =>
  api('/customer/partners/convert', { method: 'POST', body: JSON.stringify({ sourcePoints, idempotencyKey }) });
export const conversionHistory = () => api('/customer/partners/conversions');
