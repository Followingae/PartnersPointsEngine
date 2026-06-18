'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

export function getToken(): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem('rfm_token') : null;
}
export function setToken(t: string): void {
  window.localStorage.setItem('rfm_token', t);
}
export function clearToken(): void {
  window.localStorage.removeItem('rfm_token');
}

export interface ApiErrorDetails {
  kind?: 'change_request_pending' | 'governance_superadmin_managed' | string;
  changeRequestId?: string;
  canSubmit?: boolean;
  [k: string]: unknown;
}

/** Carries the structured error envelope so callers can react (e.g. governance outcomes). */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: ApiErrorDetails;
  constructor(message: string, status: number, code?: string, details?: ApiErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    clearToken();
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(err?.message ?? json?.message ?? `Request failed (${res.status})`, res.status, err?.code, err?.details);
  }
  return json as T;
}

/** Detects a maker-checker outcome on a caught mutation error (for friendly UX). */
export function governanceOutcome(e: unknown): { kind: 'pending' | 'managed'; changeRequestId?: string } | null {
  if (!(e instanceof ApiError)) return null;
  if (e.details?.kind === 'change_request_pending') return { kind: 'pending', changeRequestId: e.details.changeRequestId };
  if (e.details?.kind === 'governance_superadmin_managed') return { kind: 'managed' };
  return null;
}

export function governanceMessage(o: { kind: 'pending' | 'managed' }): string {
  return o.kind === 'pending'
    ? 'Submitted for approval — pending platform review (see Change requests).'
    : 'This change is managed by the platform. Submit it as a change request.';
}

// ── list helpers ──────────────────────────────────────────────────────────────
export interface ListResult<T> {
  rows: T[];
  total: number;
}
export interface ListParams {
  q?: string;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
function qs(params: ListParams = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── typed report shapes ──────────────────────────────────────────────────────
export interface BrandSummary {
  pointsEarned: string;
  pointsRedeemed: string;
  pointsLiability: string;
  members: number;
}
export interface RfmRow {
  membershipId: string;
  recencyDays: number | null;
  frequency: number;
  monetary: string;
  r: number;
  f: number;
  m: number;
  segment: string;
}
export interface TrendPoint {
  date: string;
  earned: string;
  redeemed: string;
}

export const login = (email: string, password: string) =>
  api<{ accessToken?: string; refreshToken?: string; expiresIn?: number; mfaRequired?: boolean }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getSummary = () => api<BrandSummary>('/manage/reports/summary');
export const getRfm = () => api<RfmRow[]>('/manage/reports/rfm');
export const getTrend = () => api<TrendPoint[]>('/manage/reports/trend');

/** Loyalty TYPE = online (web/app) vs in_store (POS terminal). */
export type LoyaltyChannel = 'online' | 'in_store';
export interface PointsByType {
  days: number;
  types: Array<{ channel: LoyaltyChannel; earned: string; redeemed: string }>;
}
export const getPointsByType = () => api<PointsByType>('/manage/reports/by-type');

// ── analytics suite (W3 → W5) ────────────────────────────────────────────────
export interface ClvReport {
  summary: { members: number; totalLifetime: string; avgLifetime: number; medianLifetime: number; p90Lifetime: number };
  distribution: Array<{ bucket: string; members: number }>;
  top: Array<{ membershipId: string; loyaltyId: string; lifetime: string; redeemed: string; net: string }>;
}
export interface VisitFrequencyReport {
  histogram: Array<{ bucket: string; members: number }>;
  leaderboard: Array<{ membershipId: string; loyaltyId: string; visits: number; lastVisit: string | null }>;
}
export interface CohortReport { offsets: number; cohorts: Array<{ cohort: string; size: number; retention: (number | null)[] }> }
export interface ChurnReport {
  buckets: Array<{ bucket: string; members: number }>;
  atRisk: Array<{ membershipId: string; loyaltyId: string; lastActivity: string | null; daysSince: number | null }>;
}
export type LiabilityAging = Array<{ bucket: string; points: string }>;
export type BranchBreakdown = Array<{ branchId: string; name: string; earned: string; redeemed: string; members: number }>;
export interface EngagementReport { funnel: Array<{ stage: string; count: number }>; repeatRate: number }

export const getClv = () => api<ClvReport>('/manage/reports/clv');
export const getVisitFrequency = () => api<VisitFrequencyReport>('/manage/reports/visit-frequency');
export const getCohorts = () => api<CohortReport>('/manage/reports/cohorts');
export const getChurnRisk = () => api<ChurnReport>('/manage/reports/churn-risk');
export const getLiabilityAging = () => api<LiabilityAging>('/manage/reports/liability-aging');
export const getByBranch = () => api<BranchBreakdown>('/manage/reports/by-branch');
export const getEngagement = () => api<EngagementReport>('/manage/reports/engagement');

/** Download an authenticated CSV report (token can't ride on a plain anchor). */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── management (brand admin) ──────────────────────────────────────────────────
export interface EarnRuleRow { id: string; name: string; priority: number; enabled: boolean; definition?: Record<string, unknown> }
export interface RewardRow { id: string; name: string; description: string | null; pointsCost: string; kind: string; status: string }
export interface TierRow { id: string; name: string; threshold: string; multiplierBps: number; benefits?: Record<string, unknown> }
export interface CampaignRow { id: string; name: string; startsAt: string | null; endsAt: string | null; enabled: boolean; definition?: Record<string, unknown> }
export interface MemberRow { membershipId: string; loyaltyId: string; status: string; available: string; lifetime: string; joinedAt: string }
export interface BadgeRow { id: string; name: string; description: string | null; icon?: string | null; rewardPoints: string }
export interface ChallengeRow { id: string; name: string; kind?: string; target: string; rewardPoints: string; badgeId: string | null; enabled: boolean }
export interface AuditRow { id: string; actorType: string; actorId: string; action: string; targetType: string | null; targetId: string | null; data: Record<string, unknown>; createdAt: string }

export interface CustomerContact {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthdate: string | null;
}
export interface CustomerProfile {
  membershipId: string;
  loyaltyId: string;
  status: string;
  joinedAt: string;
  contact: CustomerContact;
  balance: { available: string; pending: string; lifetime: string };
  tier: { id: string; name: string } | null;
  nextTier: { name: string; threshold: string } | null;
  progressPct: number;
  identifiers: Array<{ type: string; addedAt: string }>;
  transactions: Array<{ journalId: string; kind: string; direction: string; amount: string; occurredAt: string; pointState: string | null }>;
  badges: Array<{ name: string; icon: string | null; awardedAt: string }>;
  referrals: { made: number; qualified: number };
}

// earn rules
export const getEarnRules = (p?: ListParams) => api<ListResult<EarnRuleRow>>(`/manage/earn-rules${qs(p)}`);
export const getEarnRule = (id: string) => api<EarnRuleRow>(`/manage/earn-rules/${id}`);
export const createEarnRule = (body: { name: string; priority?: number; enabled?: boolean; definition: Record<string, unknown> }) =>
  api('/manage/earn-rules', { method: 'POST', body: JSON.stringify(body) });
export const updateEarnRule = (id: string, body: Partial<{ name: string; priority: number; enabled: boolean; definition: Record<string, unknown> }>) =>
  api(`/manage/earn-rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteEarnRule = (id: string) => api(`/manage/earn-rules/${id}`, { method: 'DELETE' });
export const cloneEarnRule = (id: string) => api(`/manage/earn-rules/${id}/clone`, { method: 'POST' });

// rewards
export const getRewards = (p?: ListParams) => api<ListResult<RewardRow>>(`/manage/rewards${qs(p)}`);
export const getReward = (id: string) => api<RewardRow>(`/manage/rewards/${id}`);
export const createReward = (body: { name: string; description?: string; pointsCost: number; kind?: string }) =>
  api('/manage/rewards', { method: 'POST', body: JSON.stringify(body) });
export const updateReward = (id: string, body: Partial<{ name: string; description: string; pointsCost: number; kind: string; status: string }>) =>
  api(`/manage/rewards/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteReward = (id: string) => api(`/manage/rewards/${id}`, { method: 'DELETE' });
export const cloneReward = (id: string) => api(`/manage/rewards/${id}/clone`, { method: 'POST' });

// tiers
export const getTiers = (p?: ListParams) => api<ListResult<TierRow>>(`/manage/tiers${qs(p)}`);
export const createTier = (body: { name: string; threshold: number; multiplierBps?: number }) =>
  api('/manage/tiers', { method: 'POST', body: JSON.stringify(body) });
export const updateTier = (id: string, body: Partial<{ name: string; threshold: number; multiplierBps: number; benefits: Record<string, unknown> }>) =>
  api(`/manage/tiers/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteTier = (id: string) => api(`/manage/tiers/${id}`, { method: 'DELETE' });

// campaigns
export const getCampaigns = (p?: ListParams) => api<ListResult<CampaignRow>>(`/manage/campaigns${qs(p)}`);
export const getCampaign = (id: string) => api<CampaignRow>(`/manage/campaigns/${id}`);
export const createCampaign = (body: { name: string; startsAt?: string; endsAt?: string; definition: Record<string, unknown> }) =>
  api('/manage/campaigns', { method: 'POST', body: JSON.stringify(body) });
export const updateCampaign = (id: string, body: Partial<{ name: string; startsAt: string | null; endsAt: string | null; enabled: boolean; definition: Record<string, unknown> }>) =>
  api(`/manage/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteCampaign = (id: string) => api(`/manage/campaigns/${id}`, { method: 'DELETE' });
export const cloneCampaign = (id: string) => api(`/manage/campaigns/${id}/clone`, { method: 'POST' });

// members + customer 360
export const getMembers = (p?: ListParams) => api<ListResult<MemberRow>>(`/manage/members${qs(p)}`);
export const getCustomerProfile = (id: string) => api<CustomerProfile>(`/manage/customers/${id}/profile`);
export const updateCustomerProfile = (id: string, body: Partial<{ fullName: string; gender: string; birthdate: string | null }>) =>
  api(`/manage/customers/${id}/profile`, { method: 'PATCH', body: JSON.stringify(body) });

// badges
export const getBadges = (p?: ListParams) => api<ListResult<BadgeRow>>(`/manage/badges${qs(p)}`);
export const createBadge = (body: { name: string; description?: string; icon?: string; rewardPoints?: number }) =>
  api('/manage/badges', { method: 'POST', body: JSON.stringify(body) });
export const updateBadge = (id: string, body: Partial<{ name: string; description: string; icon: string; rewardPoints: number }>) =>
  api(`/manage/badges/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteBadge = (id: string) => api(`/manage/badges/${id}`, { method: 'DELETE' });

// challenges
export const getChallenges = (p?: ListParams) => api<ListResult<ChallengeRow>>(`/manage/challenges${qs(p)}`);
export const createChallenge = (body: { name: string; kind?: string; target: number; rewardPoints?: number; badgeId?: string }) =>
  api('/manage/challenges', { method: 'POST', body: JSON.stringify(body) });
export const updateChallenge = (id: string, body: Partial<{ name: string; kind: string; target: number; rewardPoints: number; badgeId: string; enabled: boolean }>) =>
  api(`/manage/challenges/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteChallenge = (id: string) => api(`/manage/challenges/${id}`, { method: 'DELETE' });

// audit log
export const getAuditLogs = (p?: ListParams) => api<ListResult<AuditRow>>(`/manage/audit-logs${qs(p)}`);

// ── coupons (W4) ──────────────────────────────────────────────────────────────
export interface CouponRow {
  id: string; code: string; batchId: string | null; campaignName: string | null; kind: string;
  valueMinor: string; percentOff: number | null; maxRedemptions: number; perCustomerLimit: number;
  redeemedCount: number; status: string; startsAt: string | null; expiresAt: string | null;
}
export interface CouponBatch { batchId: string; campaignName: string | null; codes: number; redeemed: number; createdAt: string }
export const getCoupons = (p?: ListParams & { batchId?: string }) => api<ListResult<CouponRow>>(`/manage/coupons${qs(p as ListParams)}`);
export const getCouponBatches = () => api<CouponBatch[]>('/manage/coupons/batches');
export const bulkGenerateCoupons = (body: { pattern: string; count: number; kind?: string; valueMinor?: number; percentOff?: number; maxRedemptions?: number; perCustomerLimit?: number; campaignName?: string; expiresAt?: string }) =>
  api<{ batchId: string; requested: number; created: number; sample: string[] }>('/manage/coupons/bulk-generate', { method: 'POST', body: JSON.stringify(body) });
export const updateCoupon = (id: string, body: Partial<{ status: string; maxRedemptions: number; perCustomerLimit: number; expiresAt: string | null; campaignName: string }>) =>
  api(`/manage/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ── segments (W4) ─────────────────────────────────────────────────────────────
export interface SegmentRule { field: string; op: string; value: string | number }
export interface SegmentDefinition { match?: 'all' | 'any'; rules?: SegmentRule[] }
export interface SegmentRow { id: string; name: string; description: string | null; definition: SegmentDefinition; status: string }
export interface SegmentPreview {
  count: number;
  sample: Array<{ membershipId: string; loyaltyId: string; lifetime: string; recencyDays: number; frequency: number; tier: string | null }>;
}
export const getSegments = () => api<ListResult<SegmentRow>>('/manage/segments');
export const getSegment = (id: string) => api<SegmentRow>(`/manage/segments/${id}`);
export const createSegment = (body: { name: string; description?: string; definition: SegmentDefinition }) =>
  api<{ id: string }>('/manage/segments', { method: 'POST', body: JSON.stringify(body) });
export const updateSegment = (id: string, body: Partial<{ name: string; description: string; definition: SegmentDefinition }>) =>
  api(`/manage/segments/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteSegment = (id: string) => api(`/manage/segments/${id}`, { method: 'DELETE' });
export const previewSegment = (definition: SegmentDefinition) => api<SegmentPreview>('/manage/segments/preview', { method: 'POST', body: JSON.stringify({ definition }) });
export const getSegmentMembers = (id: string) => api<SegmentPreview>(`/manage/segments/${id}/members`);

// ── messaging templates (W4) ──────────────────────────────────────────────────
export interface TemplateRow { id: string; name: string; channel: string; event: string | null; subject: string | null; body: string; locale: string; enabled: boolean }
export const getTemplates = (channel?: string) => api<ListResult<TemplateRow>>(`/manage/templates${channel && channel !== 'all' ? `?channel=${channel}` : ''}`);
export const getTemplateVariables = () => api<{ variables: string[]; sample: Record<string, string> }>('/manage/templates/variables');
export const createTemplate = (body: { name: string; channel?: string; event?: string; subject?: string; body: string; locale?: string }) =>
  api<{ id: string }>('/manage/templates', { method: 'POST', body: JSON.stringify(body) });
export const updateTemplate = (id: string, body: Partial<{ name: string; channel: string; event: string; subject: string; body: string; locale: string; enabled: boolean }>) =>
  api(`/manage/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteTemplate = (id: string) => api(`/manage/templates/${id}`, { method: 'DELETE' });
export const previewTemplate = (body: { subject?: string; body: string }) => api<{ subject: string; body: string }>('/manage/templates/preview', { method: 'POST', body: JSON.stringify(body) });

// ── webhooks (W4) ─────────────────────────────────────────────────────────────
export interface WebhookEndpointRow { id: string; url: string; events: string[]; enabled: boolean; createdAt: string }
export interface WebhookDeliveryRow { id: string; endpointId: string; eventType: string; status: string; attempts: number; lastError: string | null; createdAt: string; deliveredAt: string | null }
export const getWebhooks = () => api<WebhookEndpointRow[]>('/manage/webhooks');
export const getWebhookEventTypes = () => api<string[]>('/manage/webhooks/event-types');
export const registerWebhook = (body: { url: string; events: string[] }) => api<{ id: string; url: string; events: string[]; secret: string }>('/manage/webhooks', { method: 'POST', body: JSON.stringify(body) });
export const updateWebhook = (id: string, body: Partial<{ url: string; events: string[]; enabled: boolean }>) => api(`/manage/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteWebhook = (id: string) => api(`/manage/webhooks/${id}`, { method: 'DELETE' });
export const rotateWebhookSecret = (id: string) => api<{ id: string; secret: string }>(`/manage/webhooks/${id}/rotate-secret`, { method: 'POST' });
export const testWebhook = (id: string) => api<{ ok: boolean; status: number; error?: string }>(`/manage/webhooks/${id}/test`, { method: 'POST' });
export const getWebhookDeliveries = (endpointId?: string) => api<ListResult<WebhookDeliveryRow>>(`/manage/webhooks/deliveries${endpointId ? `?endpointId=${endpointId}` : ''}`);

// ── team & access (W4) ────────────────────────────────────────────────────────
export interface TeamMember { assignmentId: string; userId: string; email: string; fullName: string | null; status: string; lastLoginAt: string | null; mfa: boolean; roleKey: string; roleName: string }
export const getTeam = () => api<TeamMember[]>('/manage/team');
export const getTeamRoles = () => api<Array<{ key: string; name: string }>>('/manage/team/roles');
export const inviteMember = (body: { email: string; fullName?: string; roleKey: string }) =>
  api<{ userId: string; email: string; roleKey: string; tempPassword: string | null }>('/manage/team/invite', { method: 'POST', body: JSON.stringify(body) });
export const updateMemberRole = (userId: string, roleKey: string) => api(`/manage/team/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ roleKey }) });
export const revokeMember = (userId: string) => api(`/manage/team/${userId}`, { method: 'DELETE' });

// ── API keys (W7) ─────────────────────────────────────────────────────────────
export interface ApiKeyRow { id: string; publishableId: string; status: string; rotatedAt: string | null; createdAt: string }
export const getApiKeys = () => api<ApiKeyRow[]>('/manage/api-keys');
export const createApiKey = () => api<{ id: string; publishableId: string; secret: string }>('/manage/api-keys', { method: 'POST' });
export const rotateApiKey = (id: string) => api<{ id: string; secret: string }>(`/manage/api-keys/${id}/rotate`, { method: 'POST' });
export const revokeApiKey = (id: string) => api(`/manage/api-keys/${id}`, { method: 'DELETE' });

// ── GDPR (W7) ─────────────────────────────────────────────────────────────────
export const eraseCustomer = (membershipId: string) => api(`/manage/customers/${membershipId}`, { method: 'DELETE' });
/** Download an authenticated JSON payload as a file. */
export async function downloadJson(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const text = await res.text();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// change requests (maker side)
export interface DiffEntry { path: string; old: unknown; new: unknown }
export interface ChangeRequest {
  id: string;
  entityType: string;
  entityId: string | null;
  action: 'create' | 'update' | 'delete';
  proposedPayload: Record<string, unknown>;
  currentSnapshot: Record<string, unknown> | null;
  diff: DiffEntry[];
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reason: string | null;
  decisionReason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
}
export const getChangeRequests = (p?: ListParams) => api<ListResult<ChangeRequest>>(`/manage/change-requests${qs(p)}`);
export const getChangeRequest = (id: string) => api<ChangeRequest>(`/manage/change-requests/${id}`);
export const submitChangeRequest = (body: { entityType: string; action: 'create' | 'update' | 'delete'; entityId?: string; payload?: Record<string, unknown>; reason?: string }) =>
  api<{ id: string }>('/manage/change-requests', { method: 'POST', body: JSON.stringify(body) });
export const withdrawChangeRequest = (id: string) => api(`/manage/change-requests/${id}`, { method: 'DELETE' });

// ── Lulu partnership (brand-facing) ──────────────────────────────────────────
export interface LuluStatus {
  enabled: boolean;
  status?: string;
  partner?: { key: string; name: string; currencyName: string };
  ratioBps?: number;
  minConversion?: number;
  maxConversionPerDay?: number;
  allowanceBalance?: string;
  lowBalanceThreshold?: string;
}
export interface LuluReports {
  conversions: number; sourceBurned: string; partnerIssued: string;
  trend: Array<{ date: string; conversions: number; issued: string }>;
}
export interface LuluActivityRow { id: string; membershipId: string; sourcePoints: string; partnerPoints: string; status: string; partnerTxnRef: string | null; createdAt: string }
export interface LuluLedgerRow { id: string; direction: 'credit' | 'debit'; amountMinor: string; reason: string; conversionId: string | null; createdAt: string }
export interface LuluTopupRow {
  id: string; brandId: string; amountMinor: string; currency: string;
  status: 'pending' | 'invoiced' | 'confirmed' | 'rejected';
  note: string | null; invoiceRef: string | null; reviewNote: string | null;
  createdAt: string; invoicedAt: string | null; confirmedAt: string | null;
}
export interface LuluConversionDetail {
  id: string; status: string; membershipId: string;
  customer: { loyaltyId: string | null; name: string | null };
  brand: { id: string; name: string };
  partner: { name: string; currencyName: string };
  sourcePoints: string; partnerPoints: string; ratioBps: number; allowanceCostMinor: string;
  partnerTxnRef: string | null; failureReason: string | null; idempotencyKey: string;
  createdAt: string; completedAt: string | null;
  allowanceTxns: Array<{ id: string; direction: 'credit' | 'debit'; amountMinor: string; reason: string; createdAt: string }>;
}
export const getLuluStatus = () => api<LuluStatus>('/manage/lulu/status');
export const getLuluReports = (days = 30) => api<LuluReports>(`/manage/lulu/reports?days=${days}`);
export const getLuluActivity = () => api<LuluActivityRow[]>('/manage/lulu/activity');
export const getLuluLedger = () => api<LuluLedgerRow[]>('/manage/lulu/ledger');
export const getLuluTopups = () => api<LuluTopupRow[]>('/manage/lulu/topups');
export const getLuluConversion = (id: string) => api<LuluConversionDetail>(`/manage/lulu/conversions/${id}`);
export const requestAllowanceTopup = (amountMinor: number, note?: string) => api<{ id: string; status: string; amountMinor: string }>('/manage/lulu/topup-request', { method: 'POST', body: JSON.stringify({ amountMinor, ...(note ? { note } : {}) }) });

// settings
export const getModuleAccess = () => api<{ access: Record<string, boolean> }>('/manage/modules');

export interface BrandSettings {
  id: string;
  name: string;
  slug: string;
  pointsCurrencyCode: string;
  currency: string;
  branding: Record<string, unknown>;
  status: string;
}
export const getSettings = () => api<BrandSettings>('/manage/settings');
export const updateSettings = (body: Partial<{ name: string; pointsCurrencyCode: string; currency: string; branding: Record<string, unknown> }>) =>
  api('/manage/settings', { method: 'PATCH', body: JSON.stringify(body) });
