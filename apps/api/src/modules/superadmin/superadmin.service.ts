import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { PasswordService } from '../../auth/crypto/password.service';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { TokenService } from '../../auth/tokens/token.service';
import { WalletService } from '../wallet/wallet.service';

/** Roles a superadmin can grant at the platform level. */
export const PLATFORM_ROLES = ['platform_superadmin', 'platform_support', 'analyst_readonly'] as const;

export interface AdminListQuery {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

/** Brand modules the superadmin can toggle per brand (core modules are always on). */
export const TOGGLEABLE_MODULES: Array<{ key: string; label: string }> = [
  { key: 'loyalty_online', label: 'Online loyalty (website / app)' },
  { key: 'loyalty_instore', label: 'In-store loyalty (POS terminals)' },
  { key: 'reporting', label: 'Reporting & analytics' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'coupons', label: 'Coupons' },
  { key: 'segments', label: 'Segments' },
  { key: 'tiers', label: 'Tiers' },
  { key: 'gamification', label: 'Gamification' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'api-keys', label: 'API keys' },
  { key: 'team', label: 'Team & access' },
];

/**
 * Superadmin operations (platform-scoped): merchant onboarding (group → brand →
 * branch), prepaid wallet credit, cost-rule config, and platform rollups. Runs
 * under the platform RLS context, so it can read/write across all tenants.
 */
@Injectable()
export class SuperadminService {
  constructor(
    private readonly tenants: TenantService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
  ) {}

  // ── platform team management (W7) ────────────────────────────────────────

  platformRoleOptions() {
    return PLATFORM_ROLES.map((key) => ({ key, name: key.replace(/_/g, ' ') }));
  }

  /** Invite a platform teammate: reuse/create the user, bind a platform-scoped role. */
  async invitePlatformMember(ctx: TenantContext, dto: { email: string; fullName?: string; roleKey: string }) {
    if (!PLATFORM_ROLES.includes(dto.roleKey as never)) throw new BadRequestException('invalid platform role');
    const emailLower = dto.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLower)) throw new BadRequestException('invalid email');
    return this.tenants.run(ctx, async (tx) => {
      const role = await tx.role.findFirst({ where: { key: dto.roleKey }, select: { id: true } });
      if (!role) throw new BadRequestException('role not found');
      let user = await tx.userAccount.findFirst({ where: { platformId: ctx.platformId, emailLower }, select: { id: true } });
      let tempPw: string | null = null;
      if (!user) {
        tempPw = `Tmp-${randomBytes(9).toString('base64url')}`;
        user = await tx.userAccount.create({
          data: { platformId: ctx.platformId, email: dto.email.trim(), emailLower, fullName: dto.fullName ?? null, passwordHash: await this.passwords.hash(tempPw) },
          select: { id: true },
        });
      }
      const existing = await tx.roleAssignment.findFirst({ where: { userId: user.id, scopeLevel: 'platform', scopeId: ctx.platformId }, select: { id: true } });
      if (existing) await tx.roleAssignment.update({ where: { id: existing.id }, data: { roleId: role.id } });
      else await tx.roleAssignment.create({ data: { userId: user.id, roleId: role.id, scopeLevel: 'platform', scopeId: ctx.platformId, platformId: ctx.platformId } });
      await this.audit.record(tx, ctx, { action: 'platform_team.invite', targetType: 'user_account', targetId: user.id, data: { email: emailLower, role: dto.roleKey } });
      return { userId: user.id, email: dto.email.trim(), roleKey: dto.roleKey, tempPassword: tempPw };
    });
  }

  async updatePlatformMemberRole(ctx: TenantContext, userId: string, roleKey: string) {
    if (!PLATFORM_ROLES.includes(roleKey as never)) throw new BadRequestException('invalid platform role');
    return this.tenants.run(ctx, async (tx) => {
      const role = await tx.role.findFirst({ where: { key: roleKey }, select: { id: true } });
      if (!role) throw new BadRequestException('role not found');
      const assignment = await tx.roleAssignment.findFirst({ where: { userId, scopeLevel: 'platform', scopeId: ctx.platformId }, select: { id: true } });
      if (!assignment) throw new NotFoundException('team member not found');
      await tx.roleAssignment.update({ where: { id: assignment.id }, data: { roleId: role.id } });
      await this.audit.record(tx, ctx, { action: 'platform_team.role_change', targetType: 'user_account', targetId: userId, data: { role: roleKey } });
      return { userId, roleKey };
    });
  }

  async revokePlatformMember(ctx: TenantContext, userId: string) {
    if (userId === ctx.actor.id) throw new BadRequestException('you cannot revoke your own access');
    return this.tenants.run(ctx, async (tx) => {
      const res = await tx.roleAssignment.deleteMany({ where: { userId, scopeLevel: 'platform', scopeId: ctx.platformId } });
      if (res.count === 0) throw new NotFoundException('team member not found');
      await this.audit.record(tx, ctx, { action: 'platform_team.revoke', targetType: 'user_account', targetId: userId });
      return { userId, revoked: true };
    });
  }

  /** Mint a brand-scoped admin token so the superadmin can manage a brand directly
      (full brand console), recorded as an audited impersonation session. */
  async actAsBrand(ctx: TenantContext, brandId: string) {
    const brand = await this.tenants.run(ctx, async (tx) => {
      const b = await tx.brand.findFirst({ where: { id: brandId, platformId: ctx.platformId }, select: { id: true, name: true, groupId: true } });
      if (!b) throw new NotFoundException('brand not found');
      await tx.impersonationSession.create({ data: { actorUserId: ctx.actor.id, targetType: 'brand', targetId: brandId, reason: 'superadmin brand management' } });
      await this.audit.record(tx, ctx, { action: 'brand.act_as', targetType: 'brand', targetId: brandId, data: { name: b.name } });
      return b;
    });
    const token = await this.tokens.issueAccess({
      sub: ctx.actor.id,
      surface: 'brand_admin',
      platformId: ctx.platformId,
      scopeLevel: 'brand',
      groupId: brand.groupId,
      brandId: brand.id,
      branchId: null,
      roles: ['brand_admin'],
      actorType: 'user',
    });
    return { token, brandId: brand.id, brandName: brand.name };
  }

  // ── Merchants (groups) ──────────────────────────────────────────────────────

  async createGroup(ctx: TenantContext, dto: { name: string; defaultCurrency?: string; homeRegion?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const g = await tx.group.create({
        data: { platformId: ctx.platformId, name: dto.name, defaultCurrency: dto.defaultCurrency ?? 'AED', homeRegion: dto.homeRegion ?? 'uae' },
        select: { id: true, name: true, defaultCurrency: true, homeRegion: true },
      });
      await tx.groupWallet.create({ data: { groupId: g.id, platformId: ctx.platformId, currency: g.defaultCurrency } });
      await this.audit.record(tx, ctx, { action: 'group.create', targetType: 'tenant_group', targetId: g.id, data: { name: g.name } });
      return g;
    });
  }

  async listGroups(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; name: string; default_currency: string; brands: number; wallet_balance: bigint; liability: bigint }[]
      >`
        SELECT g.id, g.name, g.default_currency,
               (SELECT count(*)::int FROM brand b WHERE b.group_id = g.id) AS brands,
               coalesce((SELECT sum(ab.posted_credits - ab.posted_debits - ab.pending_debits)
                           FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id
                          WHERE la.group_id = g.id AND la.ledger = 'wallet' AND la.account_type = 'wallet_liability'), 0)::bigint AS wallet_balance,
               coalesce((SELECT sum(ab.posted_credits - ab.posted_debits - ab.pending_debits)
                           FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id
                          WHERE la.group_id = g.id AND la.ledger = 'points' AND la.account_type = 'points_liability'), 0)::bigint AS liability
          FROM tenant_group g
         WHERE g.platform_id = ${ctx.platformId}
         ORDER BY g.created_at DESC`;
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        currency: r.default_currency,
        brands: r.brands,
        walletBalance: r.wallet_balance.toString(),
        pointsLiability: r.liability.toString(),
      }));
    });
  }

  /** Merchant 360 — group + wallet (posted/pending/available) + liability + brands + cost rule. */
  async getGroup(ctx: TenantContext, groupId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const g = await tx.group.findFirst({ where: { id: groupId, platformId: ctx.platformId } });
      if (!g) throw new NotFoundException('merchant not found');
      const wallet = await tx.groupWallet.findUnique({ where: { groupId }, select: { currency: true, lowBalanceThreshold: true, status: true } });

      const bal = await tx.$queryRaw<{ posted: bigint; pending: bigint; available: bigint }[]>`
        SELECT coalesce(sum(ab.posted_credits - ab.posted_debits), 0)::bigint AS posted,
               coalesce(sum(ab.pending_debits), 0)::bigint AS pending,
               coalesce(sum(ab.posted_credits - ab.posted_debits - ab.pending_debits), 0)::bigint AS available
          FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id
         WHERE la.group_id = ${groupId} AND la.ledger = 'wallet' AND la.account_type = 'wallet_liability'`;

      const liabRows = await tx.$queryRaw<{ liability: bigint }[]>`
        SELECT coalesce(sum(ab.posted_credits - ab.posted_debits - ab.pending_debits), 0)::bigint AS liability
          FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id
         WHERE la.group_id = ${groupId} AND la.ledger = 'points' AND la.account_type = 'points_liability'`;

      const brands = await tx.brand.findMany({
        where: { groupId }, select: { id: true, name: true, slug: true, currency: true, status: true }, orderBy: { createdAt: 'desc' },
      });
      const memberCounts = await tx.$queryRaw<{ brand_id: string; c: bigint }[]>`
        SELECT brand_id, count(*)::bigint AS c FROM customer_membership WHERE group_id = ${groupId} GROUP BY brand_id`;
      const memberByBrand = new Map(memberCounts.map((r) => [r.brand_id, Number(r.c)]));

      const costRule = await tx.costRule.findFirst({ where: { groupId }, orderBy: { effectiveFrom: 'desc' } });

      const b = bal[0] ?? { posted: 0n, pending: 0n, available: 0n };
      return {
        id: g.id,
        name: g.name,
        status: g.status,
        currency: g.defaultCurrency,
        homeRegion: g.homeRegion,
        createdAt: g.createdAt,
        wallet: {
          currency: wallet?.currency ?? g.defaultCurrency,
          lowBalanceThreshold: (wallet?.lowBalanceThreshold ?? 0n).toString(),
          status: wallet?.status ?? 'active',
          posted: b.posted.toString(),
          pending: b.pending.toString(),
          available: b.available.toString(),
        },
        pointsLiability: (liabRows[0]?.liability ?? 0n).toString(),
        brands: brands.map((br) => ({ ...br, members: memberByBrand.get(br.id) ?? 0 })),
        costRule: costRule
          ? {
              id: costRule.id,
              costPerPointMinor: costRule.costPerPointMinor.toString(),
              issuanceFeeMinor: costRule.issuanceFeeMinor.toString(),
              platformMarginBps: costRule.platformMarginBps,
              breakageOwner: costRule.breakageOwner,
              effectiveFrom: costRule.effectiveFrom,
            }
          : null,
      };
    });
  }

  async updateGroup(ctx: TenantContext, groupId: string, dto: { name?: string; defaultCurrency?: string; homeRegion?: string; lowBalanceThreshold?: number }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.group.findFirst({ where: { id: groupId, platformId: ctx.platformId }, select: { id: true } });
      if (!existing) throw new NotFoundException('merchant not found');
      const g = await tx.group.update({
        where: { id: groupId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.defaultCurrency !== undefined ? { defaultCurrency: dto.defaultCurrency } : {}),
          ...(dto.homeRegion !== undefined ? { homeRegion: dto.homeRegion } : {}),
        },
        select: { id: true, name: true, defaultCurrency: true, homeRegion: true, status: true },
      });
      if (dto.lowBalanceThreshold !== undefined) {
        // updateMany: no-throw if the group predates the wallet row.
        await tx.groupWallet.updateMany({ where: { groupId }, data: { lowBalanceThreshold: BigInt(dto.lowBalanceThreshold) } });
      }
      await this.audit.record(tx, ctx, { action: 'group.update', targetType: 'tenant_group', targetId: groupId, data: { fields: Object.keys(dto) } });
      return g;
    });
  }

  /** Suspend/reactivate a merchant (group + its wallet); brands inherit operationally. */
  async setGroupStatus(ctx: TenantContext, groupId: string, status: 'active' | 'suspended') {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.group.findFirst({ where: { id: groupId, platformId: ctx.platformId }, select: { id: true } });
      if (!existing) throw new NotFoundException('merchant not found');
      await tx.group.update({ where: { id: groupId }, data: { status } });
      await tx.groupWallet.updateMany({ where: { groupId }, data: { status } });
      await this.audit.record(tx, ctx, { action: status === 'suspended' ? 'group.suspend' : 'group.reactivate', targetType: 'tenant_group', targetId: groupId });
      return { id: groupId, status };
    });
  }

  /** Paginated append-only wallet ledger for a group. */
  async walletLedger(ctx: TenantContext, groupId: string, query: AdminListQuery = {}) {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; kind: string; direction: string; amount_minor: bigint; occurred_at: Date; source_event: string | null }[]
      >`
        SELECT j.id, j.kind, e.direction, e.amount_minor, j.occurred_at, j.source_event
          FROM entry e
          JOIN journal j ON j.id = e.journal_id
          JOIN ledger_account la ON la.id = e.account_id
         WHERE la.group_id = ${groupId} AND la.ledger = 'wallet' AND la.account_type = 'wallet_liability'
         ORDER BY j.occurred_at DESC, j.id DESC
         LIMIT ${limit} OFFSET ${offset}`;
      const total = await tx.$queryRaw<{ c: bigint }[]>`
        SELECT count(*)::bigint AS c
          FROM entry e JOIN ledger_account la ON la.id = e.account_id
         WHERE la.group_id = ${groupId} AND la.ledger = 'wallet' AND la.account_type = 'wallet_liability'`;
      return {
        rows: rows.map((r) => ({ journalId: r.id, kind: r.kind, direction: r.direction, amount: r.amount_minor.toString(), occurredAt: r.occurred_at, sourceEvent: r.source_event })),
        total: Number(total[0]?.c ?? 0n),
      };
    });
  }

  // ── Brands & branches ───────────────────────────────────────────────────────

  async createBrand(ctx: TenantContext, dto: { groupId: string; name: string; slug: string; currency?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const b = await tx.brand.create({
        data: { groupId: dto.groupId, platformId: ctx.platformId, name: dto.name, slug: dto.slug, currency: dto.currency ?? 'AED' },
        select: { id: true, name: true, slug: true },
      });
      await this.audit.record(tx, ctx, { action: 'brand.create', targetType: 'brand', targetId: b.id, data: { name: b.name, groupId: dto.groupId } });
      return b;
    });
  }

  async updateBrand(ctx: TenantContext, brandId: string, dto: { name?: string; currency?: string; status?: string; branding?: Record<string, unknown> }) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.brand.findFirst({ where: { id: brandId, platformId: ctx.platformId }, select: { id: true } });
      if (!existing) throw new NotFoundException('brand not found');
      const b = await tx.brand.update({
        where: { id: brandId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.status !== undefined ? { status: dto.status as never } : {}),
          ...(dto.branding !== undefined ? { branding: dto.branding as Prisma.InputJsonValue } : {}),
        },
        select: { id: true, name: true, slug: true, currency: true, status: true },
      });
      await this.audit.record(tx, ctx, { action: 'brand.update', targetType: 'brand', targetId: brandId, data: { fields: Object.keys(dto) } });
      return b;
    });
  }

  async listBrands(ctx: TenantContext, groupId?: string) {
    return this.tenants.run(ctx, (tx) =>
      tx.brand.findMany({
        where: { platformId: ctx.platformId, ...(groupId ? { groupId } : {}) },
        select: { id: true, name: true, slug: true, groupId: true, currency: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async createBranch(ctx: TenantContext, dto: { brandId: string; name: string; code?: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const brand = await tx.brand.findUnique({ where: { id: dto.brandId }, select: { groupId: true } });
      if (!brand) throw new NotFoundException('brand not found');
      const branch = await tx.branch.create({
        data: { brandId: dto.brandId, groupId: brand.groupId, platformId: ctx.platformId, name: dto.name, code: dto.code ?? null },
        select: { id: true, name: true, code: true },
      });
      await this.audit.record(tx, ctx, { action: 'branch.create', targetType: 'branch', targetId: branch.id, data: { name: branch.name, brandId: dto.brandId } });
      return branch;
    });
  }

  async listBranches(ctx: TenantContext, brandId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.branch.findMany({
        where: { brandId, platformId: ctx.platformId },
        select: { id: true, name: true, code: true, status: true, timezone: true, _count: { select: { terminals: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((b) => ({ id: b.id, name: b.name, code: b.code, status: b.status, timezone: b.timezone, terminals: b._count.terminals }));
    });
  }

  async setBranchStatus(ctx: TenantContext, branchId: string, status: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.branch.findFirst({ where: { id: branchId, platformId: ctx.platformId }, select: { id: true } });
      if (!existing) throw new NotFoundException('branch not found');
      const b = await tx.branch.update({ where: { id: branchId }, data: { status: status as never }, select: { id: true, status: true } });
      await this.audit.record(tx, ctx, { action: 'branch.status', targetType: 'branch', targetId: branchId, data: { status } });
      return b;
    });
  }

  async listTerminals(ctx: TenantContext, brandId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.terminal.findMany({
        where: { brandId, platformId: ctx.platformId },
        select: { id: true, label: true, status: true, pairedAt: true, branch: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((t) => ({ id: t.id, label: t.label, status: t.status, pairedAt: t.pairedAt, branchId: t.branch.id, branchName: t.branch.name }));
    });
  }

  async createTerminal(ctx: TenantContext, dto: { brandId: string; branchId: string; label: string }) {
    return this.tenants.run(ctx, async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: dto.branchId, brandId: dto.brandId, platformId: ctx.platformId }, select: { groupId: true } });
      if (!branch) throw new NotFoundException('branch not found');
      const t = await tx.terminal.create({
        data: { branchId: dto.branchId, brandId: dto.brandId, groupId: branch.groupId, platformId: ctx.platformId, label: dto.label },
        select: { id: true, label: true, status: true },
      });
      await this.audit.record(tx, ctx, { action: 'terminal.create', targetType: 'terminal', targetId: t.id, data: { label: t.label, branchId: dto.branchId } });
      return t;
    });
  }

  async setTerminalStatus(ctx: TenantContext, terminalId: string, status: string) {
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.terminal.findFirst({ where: { id: terminalId, platformId: ctx.platformId }, select: { id: true } });
      if (!existing) throw new NotFoundException('terminal not found');
      const t = await tx.terminal.update({ where: { id: terminalId }, data: { status: status as never }, select: { id: true, status: true } });
      await this.audit.record(tx, ctx, { action: 'terminal.status', targetType: 'terminal', targetId: terminalId, data: { status } });
      return t;
    });
  }

  // ── Platform settings ────────────────────────────────────────────────────────

  async getPlatformSettings(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const p = await tx.platform.findUnique({ where: { id: ctx.platformId }, select: { id: true, name: true, region: true, settings: true } });
      if (!p) throw new NotFoundException('platform not found');
      return { id: p.id, name: p.name, region: p.region, settings: (p.settings ?? {}) as Record<string, unknown> };
    });
  }

  async setPlatformSettings(ctx: TenantContext, dto: { name?: string; region?: string; settings?: Record<string, unknown> }) {
    return this.tenants.run(ctx, async (tx) => {
      const p = await tx.platform.findUnique({ where: { id: ctx.platformId }, select: { settings: true } });
      if (!p) throw new NotFoundException('platform not found');
      const merged = { ...((p.settings ?? {}) as Record<string, unknown>), ...(dto.settings ?? {}) };
      const updated = await tx.platform.update({
        where: { id: ctx.platformId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.region !== undefined ? { region: dto.region } : {}),
          settings: merged as Prisma.InputJsonValue,
        },
        select: { id: true, name: true, region: true, settings: true },
      });
      await this.audit.record(tx, ctx, { action: 'platform.settings.set', targetType: 'platform', targetId: ctx.platformId, data: { fields: Object.keys(dto) } });
      return { id: updated.id, name: updated.name, region: updated.region, settings: (updated.settings ?? {}) as Record<string, unknown> };
    });
  }

  // ── per-brand module entitlements (W7) ───────────────────────────────────

  /** Brand modules the superadmin can switch on/off (core modules are always on). */
  async getBrandModules(ctx: TenantContext, brandId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const brand = await tx.brand.findFirst({ where: { id: brandId, platformId: ctx.platformId }, select: { id: true, name: true, moduleAccess: true } });
      if (!brand) throw new NotFoundException('brand not found');
      return { brandId: brand.id, name: brand.name, modules: TOGGLEABLE_MODULES, access: (brand.moduleAccess ?? {}) as Record<string, boolean> };
    });
  }

  /** Set per-brand module access (merge). Value false = hidden/disabled for the brand. */
  async setBrandModules(ctx: TenantContext, brandId: string, access: Record<string, boolean>) {
    return this.tenants.run(ctx, async (tx) => {
      const brand = await tx.brand.findFirst({ where: { id: brandId, platformId: ctx.platformId }, select: { id: true, moduleAccess: true } });
      if (!brand) throw new NotFoundException('brand not found');
      const merged = { ...((brand.moduleAccess ?? {}) as Record<string, boolean>) };
      for (const [k, v] of Object.entries(access)) {
        if (TOGGLEABLE_MODULES.some((m) => m.key === k)) merged[k] = v;
      }
      await tx.brand.update({ where: { id: brandId }, data: { moduleAccess: merged as Prisma.InputJsonValue } });
      await this.audit.record(tx, ctx, { action: 'brand.modules.set', targetType: 'brand', targetId: brandId, data: { access } });
      return { brandId, access: merged };
    });
  }

  // ── platform breadth (W6) ────────────────────────────────────────────────

  /** Cross-merchant analytics: platform totals + per-merchant rollup. */
  async platformAnalytics(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const merchants = await tx.$queryRaw<{ id: string; name: string; status: string; currency: string; brands: number; members: number; liability: bigint; wallet: bigint }[]>`
        SELECT g.id, g.name, g.status::text AS status, g.default_currency AS currency,
               (SELECT count(*) FROM brand b WHERE b.group_id = g.id)::int AS brands,
               (SELECT count(*) FROM customer_membership m WHERE m.group_id = g.id)::int AS members,
               coalesce((SELECT sum(ab.posted_credits - ab.posted_debits - ab.pending_debits) FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id WHERE la.group_id = g.id AND la.ledger = 'points' AND la.account_type = 'points_liability'), 0)::bigint AS liability,
               coalesce((SELECT sum(ab.posted_credits - ab.posted_debits - ab.pending_debits) FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id WHERE la.group_id = g.id AND la.ledger = 'wallet' AND la.account_type = 'wallet_liability'), 0)::bigint AS wallet
          FROM tenant_group g WHERE g.platform_id = ${ctx.platformId} ORDER BY members DESC`;
      const flow = await tx.$queryRaw<{ issued: bigint; redeemed: bigint }[]>`
        SELECT coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'earn'), 0)::bigint AS issued,
               coalesce(sum(e.amount_minor) FILTER (WHERE j.kind = 'redeem_capture'), 0)::bigint AS redeemed
          FROM journal j JOIN entry e ON e.journal_id = j.id
          JOIN ledger_account la ON la.id = e.account_id AND la.account_type = 'points_liability'
         WHERE j.platform_id = ${ctx.platformId}`;
      const f = flow[0] ?? { issued: 0n, redeemed: 0n };
      const totals = {
        merchants: merchants.length,
        brands: merchants.reduce((s, m) => s + m.brands, 0),
        members: merchants.reduce((s, m) => s + m.members, 0),
        liability: merchants.reduce((s, m) => s + m.liability, 0n).toString(),
        walletFunding: merchants.reduce((s, m) => s + m.wallet, 0n).toString(),
        pointsIssued: f.issued.toString(),
        pointsRedeemed: f.redeemed.toString(),
      };
      return { totals, merchants: merchants.map((m) => ({ id: m.id, name: m.name, status: m.status, currency: m.currency, brands: m.brands, members: m.members, liability: m.liability.toString(), wallet: m.wallet.toString() })) };
    });
  }

  /** Cross-merchant brands directory with member counts + liability. */
  async brandsDirectory(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; name: string; slug: string; status: string; currency: string; merchant: string; members: number; liability: bigint }[]>`
        SELECT b.id, b.name, b.slug, b.status::text AS status, b.currency, g.name AS merchant,
               (SELECT count(*) FROM customer_membership m WHERE m.brand_id = b.id)::int AS members,
               coalesce((SELECT sum(ab.posted_credits - ab.posted_debits - ab.pending_debits) FROM account_balance ab JOIN ledger_account la ON la.id = ab.account_id WHERE la.brand_id = b.id AND la.account_type = 'points_liability'), 0)::bigint AS liability
          FROM brand b JOIN tenant_group g ON g.id = b.group_id
         WHERE b.platform_id = ${ctx.platformId} ORDER BY members DESC`;
      return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, status: r.status, currency: r.currency, merchant: r.merchant, members: r.members, liability: r.liability.toString() }));
    });
  }

  /** Merchant wallets below their configured low-balance threshold. */
  async lowBalanceAlerts(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; name: string; currency: string; threshold: bigint; available: bigint }[]>`
        SELECT g.id, g.name, gw.currency, gw.low_balance_threshold AS threshold,
               coalesce(sum(ab.posted_credits - ab.posted_debits - ab.pending_debits), 0)::bigint AS available
          FROM tenant_group g
          JOIN group_wallet gw ON gw.group_id = g.id
          LEFT JOIN ledger_account la ON la.group_id = g.id AND la.ledger = 'wallet' AND la.account_type = 'wallet_liability'
          LEFT JOIN account_balance ab ON ab.account_id = la.id
         WHERE g.platform_id = ${ctx.platformId}
         GROUP BY g.id, g.name, gw.currency, gw.low_balance_threshold
        HAVING gw.low_balance_threshold > 0 AND coalesce(sum(ab.posted_credits - ab.posted_debits - ab.pending_debits), 0) < gw.low_balance_threshold
         ORDER BY available ASC`;
      return rows.map((r) => ({ groupId: r.id, name: r.name, currency: r.currency, threshold: r.threshold.toString(), available: r.available.toString() }));
    });
  }

  /** Platform-wide audit log (tamper-evident chain), filterable. */
  async auditLogs(ctx: TenantContext, query: { q?: string; brandId?: string; limit?: number; offset?: number } = {}) {
    return this.tenants.run(ctx, async (tx) => {
      const where: Prisma.AuditLogWhereInput = {
        platformId: ctx.platformId,
        ...(query.q ? { action: { contains: query.q, mode: 'insensitive' } } : {}),
        ...(query.brandId ? { brandId: query.brandId } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(query.limit ?? 50, 200), skip: query.offset ?? 0, select: { id: true, actorType: true, actorId: true, action: true, targetType: true, targetId: true, brandId: true, groupId: true, data: true, createdAt: true } }),
        tx.auditLog.count({ where }),
      ]);
      return { rows, total };
    });
  }

  /** Platform-scoped team (users with a platform-level role). */
  async platformTeam(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ user_id: string; email: string; full_name: string | null; status: string; last_login_at: Date | null; totp: boolean; role_key: string; role_name: string }[]>`
        SELECT u.id AS user_id, u.email, u.full_name, u.status::text AS status, u.last_login_at, u.totp_enabled AS totp, r.key AS role_key, r.name AS role_name
          FROM role_assignment ra
          JOIN user_account u ON u.id = ra.user_id
          JOIN rbac_role r ON r.id = ra.role_id
         WHERE ra.platform_id = ${ctx.platformId} AND ra.scope_level = 'platform'
         ORDER BY u.created_at ASC`;
      return rows.map((r) => ({ userId: r.user_id, email: r.email, fullName: r.full_name, status: r.status, lastLoginAt: r.last_login_at, mfa: r.totp, roleKey: r.role_key, roleName: r.role_name }));
    });
  }

  async listCostRules(ctx: TenantContext, groupId: string) {
    return this.tenants
      .run(ctx, (tx) => tx.costRule.findMany({ where: { groupId }, orderBy: { effectiveFrom: 'desc' }, take: 20 }))
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          costPerPointMinor: r.costPerPointMinor.toString(),
          issuanceFeeMinor: r.issuanceFeeMinor.toString(),
          platformMarginBps: r.platformMarginBps,
          breakageOwner: r.breakageOwner,
          effectiveFrom: r.effectiveFrom,
        })),
      );
  }

  // ── Wallet credit + cost model ──────────────────────────────────────────────

  topUpWallet(ctx: TenantContext, groupId: string, amountMinor: number, currency: string, idempotencyKey: string) {
    return this.wallet.topUp(ctx, {
      scope: { platformId: ctx.platformId, groupId, brandId: null },
      currency,
      amountMinor: BigInt(amountMinor),
      occurredAt: new Date(),
      idem: { actorId: ctx.actor.id, key: idempotencyKey },
    });
  }

  async setCostRule(ctx: TenantContext, groupId: string, dto: { costPerPointMinor: number; platformMarginBps?: number; issuanceFeeMinor?: number; breakageOwner?: 'merchant' | 'platform' | 'split' }) {
    return this.tenants.run(ctx, async (tx) => {
      const r = await tx.costRule.create({
        data: {
          groupId,
          platformId: ctx.platformId,
          costPerPointMinor: BigInt(dto.costPerPointMinor),
          platformMarginBps: dto.platformMarginBps ?? 0,
          issuanceFeeMinor: BigInt(dto.issuanceFeeMinor ?? 0),
          breakageOwner: dto.breakageOwner ?? 'merchant',
        },
        select: { id: true, costPerPointMinor: true, platformMarginBps: true, breakageOwner: true },
      });
      await this.audit.record(tx, ctx, { action: 'cost_rule.set', targetType: 'cost_rule', targetId: r.id, data: { groupId } });
      return { ...r, costPerPointMinor: r.costPerPointMinor.toString() };
    });
  }
}
