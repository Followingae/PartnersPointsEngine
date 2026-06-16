import { Injectable } from '@nestjs/common';

/**
 * Minimal Policy Decision Point (PDP) for Phase 1: RBAC role→permission mapping
 * (mirrors the seeded built-ins). Phase 8 expands this to full ABAC (brand/branch
 * attributes) via a centralized policy engine; the call sites (PermissionsGuard)
 * stay the same.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  platform_superadmin: [
    'platform.manage',
    'platform.report.read',
    'group.manage',
    'group.wallet.manage',
    'brand.manage',
    'brand.campaign.write',
    'brand.customer.read',
    'brand.report.read',
    'branch.manage',
  ],
  platform_support: ['platform.report.read', 'group.manage', 'brand.manage'],
  group_admin: ['group.manage', 'group.wallet.manage', 'brand.manage', 'brand.report.read'],
  brand_admin: ['brand.manage', 'brand.campaign.write', 'brand.customer.read', 'brand.report.read'],
  branch_manager: ['branch.manage', 'brand.customer.read'],
  analyst_readonly: ['brand.report.read', 'platform.report.read'],
};

@Injectable()
export class AuthzService {
  hasPermission(roles: string[] | undefined, permission: string): boolean {
    if (!roles) return false;
    return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(permission));
  }
}
