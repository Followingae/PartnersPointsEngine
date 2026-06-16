import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@rfm-loyalty/shared';
import { PasswordService } from '../../auth/crypto/password.service';
import { AuditService } from '../../platform-core/audit/audit.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';

/** Roles a brand admin may assign within their brand. */
export const BRAND_ROLES = ['brand_admin', 'branch_manager', 'analyst_readonly'] as const;
const tempPassword = () => `Tmp-${randomBytes(9).toString('base64url')}`;

@Injectable()
export class TeamService {
  constructor(
    private readonly tenants: TenantService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  /** Users with a brand-scoped role assignment (RLS scopes assignments to this brand). */
  async list(ctx: TenantContext) {
    return this.tenants.run(ctx, async (tx) => {
      const assignments = await tx.roleAssignment.findMany({
        where: { brandId: ctx.brandId!, scopeLevel: 'brand' },
        include: { user: { select: { id: true, email: true, fullName: true, status: true, lastLoginAt: true, totpEnabled: true } }, role: { select: { key: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return assignments.map((a) => ({
        assignmentId: a.id,
        userId: a.user.id,
        email: a.user.email,
        fullName: a.user.fullName,
        status: a.user.status,
        lastLoginAt: a.user.lastLoginAt,
        mfa: a.user.totpEnabled,
        roleKey: a.role.key,
        roleName: a.role.name,
      }));
    });
  }

  roles() {
    return BRAND_ROLES.map((key) => ({ key, name: key.replace(/_/g, ' ') }));
  }

  /** Invite a teammate to the brand: reuse or create the platform user, then bind the role. */
  async invite(ctx: TenantContext, dto: { email: string; fullName?: string; roleKey: string }) {
    if (!BRAND_ROLES.includes(dto.roleKey as never)) throw new BadRequestException('invalid role for a brand');
    const emailLower = dto.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLower)) throw new BadRequestException('invalid email');

    return this.tenants.run(ctx, async (tx) => {
      const role = await tx.role.findFirst({ where: { key: dto.roleKey }, select: { id: true, name: true } });
      if (!role) throw new BadRequestException('role not found');

      let user = await tx.userAccount.findFirst({ where: { platformId: ctx.platformId, emailLower }, select: { id: true } });
      let tempPw: string | null = null;
      if (!user) {
        tempPw = tempPassword();
        user = await tx.userAccount.create({
          data: { platformId: ctx.platformId, email: dto.email.trim(), emailLower, fullName: dto.fullName ?? null, passwordHash: await this.passwords.hash(tempPw) },
          select: { id: true },
        });
      }

      const existing = await tx.roleAssignment.findFirst({ where: { userId: user.id, scopeLevel: 'brand', scopeId: ctx.brandId! }, select: { id: true } });
      if (existing) {
        await tx.roleAssignment.update({ where: { id: existing.id }, data: { roleId: role.id } });
      } else {
        await tx.roleAssignment.create({
          data: { userId: user.id, roleId: role.id, scopeLevel: 'brand', scopeId: ctx.brandId!, platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId! },
        });
      }
      await this.audit.record(tx, ctx, { action: 'team.invite', targetType: 'user_account', targetId: user.id, data: { email: emailLower, role: dto.roleKey } });
      return { userId: user.id, email: dto.email.trim(), roleKey: dto.roleKey, tempPassword: tempPw };
    });
  }

  async updateRole(ctx: TenantContext, userId: string, roleKey: string) {
    if (!BRAND_ROLES.includes(roleKey as never)) throw new BadRequestException('invalid role for a brand');
    return this.tenants.run(ctx, async (tx) => {
      const role = await tx.role.findFirst({ where: { key: roleKey }, select: { id: true } });
      if (!role) throw new BadRequestException('role not found');
      const assignment = await tx.roleAssignment.findFirst({ where: { userId, scopeLevel: 'brand', scopeId: ctx.brandId! }, select: { id: true } });
      if (!assignment) throw new NotFoundException('team member not found');
      await tx.roleAssignment.update({ where: { id: assignment.id }, data: { roleId: role.id } });
      await this.audit.record(tx, ctx, { action: 'team.role_change', targetType: 'user_account', targetId: userId, data: { role: roleKey } });
      return { userId, roleKey };
    });
  }

  /** Revoke a teammate's access to THIS brand (removes brand-scoped assignments only). */
  async revoke(ctx: TenantContext, userId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const res = await tx.roleAssignment.deleteMany({ where: { userId, scopeLevel: 'brand', scopeId: ctx.brandId! } });
      if (res.count === 0) throw new NotFoundException('team member not found');
      await this.audit.record(tx, ctx, { action: 'team.revoke', targetType: 'user_account', targetId: userId });
      return { userId, revoked: true };
    });
  }
}
