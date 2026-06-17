'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

export function getToken(): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem('rfm_sa_token') : null;
}
export function setToken(t: string): void {
  window.localStorage.setItem('rfm_sa_token', t);
}
export function clearToken(): void {
  window.localStorage.removeItem('rfm_sa_token');
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
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json as T;
}

export interface Overview {
  pointsLiabilityOutstanding: string;
  walletBalancesTotal: string;
  brands: number;
  groups: number;
  journals: number;
}

export interface GroupRow {
  id: string;
  name: string;
  currency: string;
  brands: number;
  walletBalance: string;
  pointsLiability: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  status: string;
  currency: string;
  homeRegion: string;
  createdAt: string;
  wallet: { currency: string; lowBalanceThreshold: string; status: string; posted: string; pending: string; available: string };
  pointsLiability: string;
  brands: Array<{ id: string; name: string; slug: string; currency: string; status: string; members: number }>;
  costRule: { id: string; costPerPointMinor: string; issuanceFeeMinor: string; platformMarginBps: number; breakageOwner: string; effectiveFrom: string } | null;
}

export interface WalletEntry { journalId: string; kind: string; direction: string; amount: string; occurredAt: string; sourceEvent: string | null }
export interface CostRuleRow { id: string; costPerPointMinor: string; issuanceFeeMinor: string; platformMarginBps: number; breakageOwner: string; effectiveFrom: string }
export interface ListResult<T> { rows: T[]; total: number }

export const login = (email: string, password: string) =>
  api<{ accessToken?: string; mfaRequired?: boolean }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getOverview = () => api<Overview>('/admin/reports/overview');

// merchants (groups)
export const getGroups = () => api<GroupRow[]>('/admin/groups');
export const getGroup = (id: string) => api<GroupDetail>(`/admin/groups/${id}`);
export const createGroup = (body: { name: string; defaultCurrency?: string; homeRegion?: string }) =>
  api<{ id: string; name: string }>('/admin/groups', { method: 'POST', body: JSON.stringify(body) });
export const updateGroup = (id: string, body: Partial<{ name: string; defaultCurrency: string; homeRegion: string; lowBalanceThreshold: number }>) =>
  api(`/admin/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const setGroupStatus = (id: string, status: 'active' | 'suspended') =>
  api(`/admin/groups/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });

// wallet
export const getWalletLedger = (id: string, params: { limit?: number; offset?: number } = {}) => {
  const sp = new URLSearchParams();
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.offset) sp.set('offset', String(params.offset));
  const s = sp.toString();
  return api<ListResult<WalletEntry>>(`/admin/groups/${id}/wallet/ledger${s ? `?${s}` : ''}`);
};
export const topUpWallet = (id: string, body: { amountMinor: number; currency?: string; idempotencyKey: string }) =>
  api(`/admin/groups/${id}/wallet/topup`, { method: 'POST', body: JSON.stringify(body) });

// cost rules
export const getCostRules = (id: string) => api<CostRuleRow[]>(`/admin/groups/${id}/cost-rules`);
export const setCostRule = (id: string, body: { costPerPointMinor: number; platformMarginBps?: number; issuanceFeeMinor?: number; breakageOwner?: string }) =>
  api(`/admin/groups/${id}/cost-rule`, { method: 'POST', body: JSON.stringify(body) });

// brands + branches
export const createBrand = (groupId: string, body: { name: string; slug: string; currency?: string }) =>
  api<{ id: string; name: string; slug: string }>(`/admin/groups/${groupId}/brands`, { method: 'POST', body: JSON.stringify(body) });
export const updateBrand = (brandId: string, body: Partial<{ name: string; currency: string; status: string }>) =>
  api(`/admin/brands/${brandId}`, { method: 'PATCH', body: JSON.stringify(body) });
export const createBranch = (brandId: string, body: { name: string; code?: string }) =>
  api(`/admin/brands/${brandId}/branches`, { method: 'POST', body: JSON.stringify(body) });

export interface AdminBranch { id: string; name: string; code: string | null; status: string; timezone: string; terminals: number }
export interface AdminTerminal { id: string; label: string; status: string; pairedAt: string | null; branchId: string; branchName: string }
export const getBranches = (brandId: string) => api<AdminBranch[]>(`/admin/brands/${brandId}/branches`);
export const setBranchStatus = (branchId: string, status: string) =>
  api(`/admin/branches/${branchId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const getTerminals = (brandId: string) => api<AdminTerminal[]>(`/admin/brands/${brandId}/terminals`);
export const createTerminal = (brandId: string, body: { branchId: string; label: string }) =>
  api(`/admin/brands/${brandId}/terminals`, { method: 'POST', body: JSON.stringify(body) });
export const setTerminalStatus = (terminalId: string, status: string) =>
  api(`/admin/terminals/${terminalId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export interface PlatformSettings { id: string; name: string; region: string; settings: Record<string, unknown> }
export const getPlatformSettings = () => api<PlatformSettings>('/admin/settings');
export const setPlatformSettings = (body: { name?: string; region?: string; settings?: Record<string, unknown> }) =>
  api('/admin/settings', { method: 'PATCH', body: JSON.stringify(body) });

const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
export { uuid };

// ── governance / approvals (checker side) ─────────────────────────────────────
export interface DiffEntry { path: string; old: unknown; new: unknown }
export interface ChangeRequest {
  id: string;
  brandId: string;
  entityType: string;
  entityId: string | null;
  action: 'create' | 'update' | 'delete';
  proposedPayload: Record<string, unknown>;
  currentSnapshot: Record<string, unknown> | null;
  diff: DiffEntry[];
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reason: string | null;
  requesterId: string;
  reviewerId: string | null;
  decisionReason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
}
export interface GovernanceConfig {
  brandId: string;
  name: string;
  defaultMode: 'autonomous' | 'approval_required' | 'superadmin_managed';
  overrides: Array<{ entityType: string; mode: string }>;
  capabilities: string[];
}
export interface GovernanceStats { pending: number; approved: number; rejected: number; withdrawn: number; approvalRate: number | null }

const qs = (p: Record<string, unknown> = {}) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const getChangeRequests = (p: { status?: string; entityType?: string; brandId?: string; limit?: number; offset?: number } = {}) =>
  api<ListResult<ChangeRequest>>(`/admin/change-requests${qs(p)}`);
export const getChangeRequest = (id: string) => api<ChangeRequest>(`/admin/change-requests/${id}`);
export const approveChangeRequest = (id: string) => api(`/admin/change-requests/${id}/approve`, { method: 'PATCH' });
export const rejectChangeRequest = (id: string, decisionReason?: string) =>
  api(`/admin/change-requests/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ decisionReason }) });
export const bulkApprove = (ids: string[]) => api('/admin/change-requests/bulk-approve', { method: 'POST', body: JSON.stringify({ ids }) });
export const bulkReject = (ids: string[], decisionReason?: string) => api('/admin/change-requests/bulk-reject', { method: 'POST', body: JSON.stringify({ ids, decisionReason }) });
export const getGovernanceStats = () => api<GovernanceStats>('/admin/governance-stats');
export const getBrandGovernance = (brandId: string) => api<GovernanceConfig>(`/admin/brands/${brandId}/governance`);
export const setBrandGovernance = (brandId: string, body: { defaultMode?: string; overrides?: Array<{ entityType: string; mode: string }> }) =>
  api<GovernanceConfig>(`/admin/brands/${brandId}/governance`, { method: 'PATCH', body: JSON.stringify(body) });
export const getBrands = (groupId?: string) => api<Array<{ id: string; name: string; slug: string; groupId: string; currency: string; status: string }>>(`/admin/brands${groupId ? `?groupId=${groupId}` : ''}`);

// ── platform breadth (W6) ─────────────────────────────────────────────────────
export interface PlatformAnalytics {
  totals: { merchants: number; brands: number; members: number; liability: string; walletFunding: string; pointsIssued: string; pointsRedeemed: string };
  merchants: Array<{ id: string; name: string; status: string; currency: string; brands: number; members: number; liability: string; wallet: string }>;
}
export interface BrandDirectoryRow { id: string; name: string; slug: string; status: string; currency: string; merchant: string; members: number; liability: string }
export interface LowBalanceAlert { groupId: string; name: string; currency: string; threshold: string; available: string }
export interface PlatformAuditRow { id: string; actorType: string; actorId: string; action: string; targetType: string | null; targetId: string | null; brandId: string | null; groupId: string | null; data: Record<string, unknown>; createdAt: string }
export interface PlatformTeamMember { userId: string; email: string; fullName: string | null; status: string; lastLoginAt: string | null; mfa: boolean; roleKey: string; roleName: string }

export const getPlatformAnalytics = () => api<PlatformAnalytics>('/admin/analytics');
export const getBrandsDirectory = () => api<BrandDirectoryRow[]>('/admin/brands-directory');
export const getLowBalanceAlerts = () => api<LowBalanceAlert[]>('/admin/wallet/low-balance');
export const getPlatformAuditLogs = (q?: string) => api<ListResult<PlatformAuditRow>>(`/admin/audit-logs${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const getPlatformTeam = () => api<PlatformTeamMember[]>('/admin/team');
export const getPlatformTeamRoles = () => api<Array<{ key: string; name: string }>>('/admin/team/roles');
export const invitePlatformMember = (body: { email: string; fullName?: string; roleKey: string }) =>
  api<{ userId: string; email: string; roleKey: string; tempPassword: string | null }>('/admin/team/invite', { method: 'POST', body: JSON.stringify(body) });
export const updatePlatformMemberRole = (userId: string, roleKey: string) => api(`/admin/team/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ roleKey }) });
export const revokePlatformMember = (userId: string) => api(`/admin/team/${userId}`, { method: 'DELETE' });

// ── per-brand module entitlements (W7) ────────────────────────────────────────
export interface BrandModules { brandId: string; name: string; modules: Array<{ key: string; label: string }>; access: Record<string, boolean> }
export const getBrandModules = (brandId: string) => api<BrandModules>(`/admin/brands/${brandId}/modules`);
export const setBrandModules = (brandId: string, access: Record<string, boolean>) =>
  api<{ brandId: string; access: Record<string, boolean> }>(`/admin/brands/${brandId}/modules`, { method: 'PATCH', body: JSON.stringify({ access }) });

// ── act-as-brand (W7): open the full brand console as a brand (audited) ────────
export const BRAND_CONSOLE_URL = process.env.NEXT_PUBLIC_BRAND_URL ?? 'http://localhost:3000';
export const actAsBrand = (brandId: string) => api<{ token: string; brandId: string; brandName: string }>(`/admin/brands/${brandId}/act-as`, { method: 'POST' });
/** Mint a brand-scoped token and open the brand console managing that brand. */
export async function manageBrand(brandId: string): Promise<void> {
  const { token } = await actAsBrand(brandId);
  window.open(`${BRAND_CONSOLE_URL}/act?token=${encodeURIComponent(token)}`, '_blank', 'noopener');
}
