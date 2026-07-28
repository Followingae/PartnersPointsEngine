import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Customer API client for the Partners Points mobile app.
 *
 * The customer token is per-brand (the programme is closed-loop), so a session
 * belongs to one brand at a time. Screens that show every wallet at once still
 * use sample data until a platform-level "my wallets" endpoint exists.
 */
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.partnerspoints.ae/v1';
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

// ── Loyalty (per-brand, from the customer token) ───────────────────────────

export interface Balance {
  available: string;
  pending: string;
  lifetime: string;
  tier: { id: string; name: string } | null;
}
export const getBalance = () => api<Balance>('/customer/balance');

export interface TxnRow {
  journalId: string;
  kind: string;
  direction: string;
  amount: string;
  occurredAt: string;
  pointState: string | null;
}
export const getTransactions = () => api<TxnRow[]>('/customer/transactions');

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  pointsCost: string;
  kind: string;
}
export const getRewards = () => api<Reward[]>('/customer/rewards');
export const redeemReward = (id: string, idempotencyKey: string) =>
  api<{ voucher: { code: string; status: string; pointsSpent: string } }>(`/customer/rewards/${id}/redeem`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
/** Mark an issued voucher as used (the till can also do this). */
export const useVoucher = (code: string) =>
  api<{ code: string; status: string }>(`/customer/vouchers/${code}/redeem`, { method: 'POST' });

export interface BadgeAward {
  awardedAt: string;
  badge: { name: string; icon: string | null };
}
export const getBadges = () => api<BadgeAward[]>('/customer/badges');
export const getLeaderboard = () => api('/customer/leaderboard');
export const getReferralCode = () => api<{ code: string }>('/customer/referral-code');
export const redeemReferral = (code: string) =>
  api('/customer/referral/redeem', { method: 'POST', body: JSON.stringify({ code }) });

// ── Convert to Lulu (partnerships) ─────────────────────────────────────────
export const linkPartner = (partnerKey: string, memberRef: string) =>
  api('/customer/partners/link', { method: 'POST', body: JSON.stringify({ partnerKey, memberRef }) });
export const previewConvert = (sourcePoints: number) =>
  api('/customer/partners/preview', { method: 'POST', body: JSON.stringify({ sourcePoints }) });
export const convert = (sourcePoints: number, idempotencyKey: string) =>
  api('/customer/partners/convert', { method: 'POST', body: JSON.stringify({ sourcePoints, idempotencyKey }) });
export const conversionHistory = () => api('/customer/partners/conversions');
