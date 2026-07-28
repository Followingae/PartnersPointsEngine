import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Customer API client.
 *
 * Two kinds of session exist, and the distinction is load-bearing:
 *
 *  · The **wallet session** is person-level and spans every brand someone
 *    belongs to. It is what the app signs in with and what the tab screens read.
 *  · A **brand session** is scoped to one card and is what the per-brand
 *    endpoints (rewards, redemption, partners) require. The app trades the
 *    wallet session for one on demand and caches it per brand.
 *
 * Brand tokens are short-lived, so `brandApi` mints and re-mints them as needed
 * rather than making every caller reason about expiry.
 */
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.partnerspoints.ae/v1';

const WALLET_TOKEN = 'pp_wallet_token';
const REFRESH_TOKEN = 'pp_refresh_token';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
  /** The session is gone or rejected — the caller should send the user to sign in. */
  get isAuth(): boolean {
    return this.status === 401;
  }
}

// ── session storage ────────────────────────────────────────────────────────

export const getWalletToken = () => AsyncStorage.getItem(WALLET_TOKEN);

export async function saveSession(accessToken: string, refreshToken?: string): Promise<void> {
  await AsyncStorage.setItem(WALLET_TOKEN, accessToken);
  if (refreshToken) await AsyncStorage.setItem(REFRESH_TOKEN, refreshToken);
}

export async function clearSession(): Promise<void> {
  brandTokens.clear();
  await AsyncStorage.multiRemove([WALLET_TOKEN, REFRESH_TOKEN]);
}

// ── transport ──────────────────────────────────────────────────────────────

async function request<T>(path: string, opts: RequestInit, token: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers ?? {}),
      },
    });
  } catch {
    // fetch only rejects when the request never completed at all.
    throw new ApiError('No connection. Check your network and try again.', 0);
  }

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const body = json as
      | { message?: string | string[]; error?: { message?: string; code?: string } }
      | null;
    const raw = body?.error?.message ?? body?.message;
    const message = Array.isArray(raw) ? raw[0]! : (raw ?? `Something went wrong (${res.status})`);
    throw new ApiError(message, res.status, body?.error?.code);
  }
  return json as T;
}

/** Unauthenticated call — sign-in only. */
const publicApi = <T>(path: string, opts: RequestInit = {}) => request<T>(path, opts, null);

/**
 * Renews the wallet session. Shared so that several screens failing at once
 * produce one refresh rather than a stampede that revokes each other's tokens.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const rt = await AsyncStorage.getItem(REFRESH_TOKEN);
      if (!rt) return false;
      const r = await request<{ accessToken: string; refreshToken: string }>(
        '/customer/auth/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken: rt }) },
        null,
      );
      await saveSession(r.accessToken, r.refreshToken);
      brandTokens.clear();
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * Person-level call on the wallet session.
 *
 * Access tokens are short-lived, so an expired one is renewed and the call
 * retried once. Only a refresh that itself fails means the customer is really
 * signed out.
 */
export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getWalletToken();
  if (!token) throw new ApiError('Signed out', 401);
  try {
    return await request<T>(path, opts, token);
  } catch (e) {
    if (!(e instanceof ApiError) || !e.isAuth) throw e;
    if (!(await refreshSession())) throw e;
    const fresh = await getWalletToken();
    return request<T>(path, opts, fresh);
  }
}

// ── per-brand sessions ─────────────────────────────────────────────────────

interface BrandToken {
  token: string;
  expiresAt: number;
}
const brandTokens = new Map<string, BrandToken>();

async function brandToken(brandId: string, force = false): Promise<string> {
  const cached = brandTokens.get(brandId);
  // Re-mint slightly early so a token can't expire mid-flight.
  if (!force && cached && cached.expiresAt - 30_000 > Date.now()) return cached.token;

  const minted = await api<{ accessToken: string; expiresIn: number }>(
    `/customer/wallet/cards/${brandId}/token`,
    { method: 'POST' },
  );
  brandTokens.set(brandId, {
    token: minted.accessToken,
    expiresAt: Date.now() + minted.expiresIn * 1000,
  });
  return minted.accessToken;
}

/**
 * Call a brand-scoped endpoint for one card. A rejected token is re-minted once:
 * the wallet session is the source of truth, so a stale brand token is a cache
 * problem, not a reason to sign the user out.
 */
export async function brandApi<T>(
  brandId: string,
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  try {
    return await request<T>(path, opts, await brandToken(brandId));
  } catch (e) {
    if (e instanceof ApiError && e.isAuth) {
      return request<T>(path, opts, await brandToken(brandId, true));
    }
    throw e;
  }
}

/** Unique per attempt, so a retry after a timeout can't double-spend. */
const idem = () => `app-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// ── auth ───────────────────────────────────────────────────────────────────

export const requestOtp = (phone: string) =>
  publicApi<{ sent: true }>('/customer/auth/otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

export async function verifyOtp(phone: string, code: string): Promise<void> {
  const r = await publicApi<{ accessToken: string; refreshToken: string }>(
    '/customer/auth/wallet',
    { method: 'POST', body: JSON.stringify({ phone, code }) },
  );
  await saveSession(r.accessToken, r.refreshToken);
}

// ── wallet (person-level) ──────────────────────────────────────────────────

export interface Card {
  membershipId: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  branding: Record<string, unknown>;
  pointsCode: string;
  currency: string;
  loyaltyId: string;
  joinedAt: string;
  available: string;
  lifetime: string;
  tier: string | null;
  nextTier: string | null;
  nextTierThreshold: string | null;
  progressPct: number;
  toNextTier: string | null;
}

export type VoucherStatus = 'issued' | 'reserved' | 'redeemed' | 'expired' | 'void';

export interface Voucher {
  id: string;
  code: string;
  status: VoucherStatus;
  brandId: string;
  brandName: string;
  branding: Record<string, unknown>;
  rewardName: string;
  discountMinor: number;
  currency: string;
  pointsSpent: string;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
}

export type ActivityType =
  | 'earn' | 'redeem' | 'expiry' | 'adjust' | 'void' | 'reverse' | 'transfer'
  | 'voucher_issued' | 'voucher_redeemed' | 'voucher_expired';

export interface ActivityEvent {
  id: string;
  at: string;
  type: ActivityType;
  /** Already human-readable — render it, don't re-derive from `type`. */
  title: string;
  /** Pre-signed ("+120" / "−500"), or null when the event moves no points. */
  points: string | null;
  direction: 'credit' | 'debit' | null;
  rewardName: string | null;
  voucherCode: string | null;
  brandId: string | null;
  brandName: string | null;
}

export interface Profile {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthdate: string | null;
  joinedAt: string;
}

export interface DiscoverBrand {
  brandId: string;
  brandName: string;
  brandSlug: string;
  branding: Record<string, unknown>;
  pointsCode: string;
  joined: boolean;
}

/** Join a brand and get a card. Safe to call twice — re-joining is a no-op. */
export const joinBrand = (brandId: string) =>
  api<{ membershipId: string; loyaltyId: string; alreadyMember: boolean }>(
    `/customer/wallet/brands/${brandId}/join`,
    { method: 'POST' },
  );

/** The value to render as a QR at this brand's till. */
export const getScanCode = (brandId: string) =>
  api<{ value: string; loyaltyId: string; membershipId: string }>(
    `/customer/wallet/cards/${brandId}/scan-code`,
  );

export const getCards = () => api<Card[]>('/customer/wallet/cards');
export const getVouchers = () => api<Voucher[]>('/customer/wallet/vouchers');
export const getActivity = (limit = 60) =>
  api<ActivityEvent[]>(`/customer/wallet/activity?limit=${limit}`);
export const getProfile = () => api<Profile>('/customer/wallet/profile');
export const getDiscoverBrands = () => api<DiscoverBrand[]>('/customer/wallet/brands');

export const updateProfile = (dto: {
  fullName?: string;
  gender?: string;
  birthdate?: string | null;
}) => api<Profile>('/customer/wallet/profile', { method: 'PATCH', body: JSON.stringify(dto) });

// ── per-card (brand-scoped) ────────────────────────────────────────────────

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  pointsCost: string;
  kind: string;
}

export const getRewards = (brandId: string) => brandApi<Reward[]>(brandId, '/customer/rewards');

export const redeemReward = (brandId: string, rewardId: string) =>
  brandApi<{ voucher: { code: string; status: string; pointsSpent: string } }>(
    brandId,
    `/customer/rewards/${rewardId}/redeem`,
    { method: 'POST', body: JSON.stringify({ idempotencyKey: idem() }) },
  );

export interface BadgeAward {
  awardedAt: string;
  badge: { name: string; icon: string | null };
}
export const getBadges = (brandId: string) => brandApi<BadgeAward[]>(brandId, '/customer/badges');

export const getReferralCode = (brandId: string) =>
  brandApi<{ code: string }>(brandId, '/customer/referral-code');

export const redeemReferral = (brandId: string, code: string) =>
  brandApi(brandId, '/customer/referral/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

// ── convert to partner points (Lulu) ───────────────────────────────────────

export const linkPartner = (brandId: string, partnerKey: string, memberRef: string) =>
  brandApi(brandId, '/customer/partners/link', {
    method: 'POST',
    body: JSON.stringify({ partnerKey, memberRef }),
  });

export interface ConversionPreview {
  sourcePoints: number;
  partnerPoints: number;
  ratioBps?: number;
  eligible?: boolean;
  reason?: string | null;
}

export const previewConvert = (brandId: string, sourcePoints: number) =>
  brandApi<ConversionPreview>(brandId, '/customer/partners/preview', {
    method: 'POST',
    body: JSON.stringify({ sourcePoints }),
  });

export const convertPoints = (brandId: string, sourcePoints: number) =>
  brandApi<{ status: string; partnerPoints?: number }>(brandId, '/customer/partners/convert', {
    method: 'POST',
    body: JSON.stringify({ sourcePoints, idempotencyKey: idem() }),
  });

export const getConversions = (brandId: string) =>
  brandApi<unknown[]>(brandId, '/customer/partners/conversions');
