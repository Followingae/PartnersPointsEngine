import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import {
  AdminListQueryDto,
  CostRuleDto,
  CreateBranchDto,
  CreateBrandDto,
  CreateGroupDto,
  CreateTerminalDto,
  EntityStatusDto,
  GroupStatusDto,
  InviteTeamDto,
  PlatformSettingsDto,
  SetModulesDto,
  TeamRoleDto,
  TopUpDto,
  UpdateBrandDto,
  UpdateGroupDto,
} from './dto';
import { SuperadminService } from './superadmin.service';

/** Superadmin platform operations — merchant onboarding + wallet credit. */
@ApiTags('superadmin')
@ApiBearerAuth('admin')
@Controller('admin')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class SuperadminController {
  constructor(private readonly superadmin: SuperadminService) {}

  @Post('groups')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Onboard a merchant group (creates its prepaid wallet).' })
  createGroup(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateGroupDto) {
    return this.superadmin.createGroup(ctx, dto);
  }

  @Get('groups')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'List merchant groups with brand counts, wallet balance, points liability.' })
  listGroups(@CurrentTenant() ctx: TenantContext) {
    return this.superadmin.listGroups(ctx);
  }

  @Get('groups/:groupId')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Merchant 360 — wallet balance, liability, brands, cost rule.' })
  getGroup(@CurrentTenant() ctx: TenantContext, @Param('groupId') groupId: string) {
    return this.superadmin.getGroup(ctx, groupId);
  }

  @Patch('groups/:groupId')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Update a merchant group (name, currency, region, low-balance threshold).' })
  updateGroup(@CurrentTenant() ctx: TenantContext, @Param('groupId') groupId: string, @Body() dto: UpdateGroupDto) {
    return this.superadmin.updateGroup(ctx, groupId, dto);
  }

  @Post('groups/:groupId/status')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Suspend or reactivate a merchant.' })
  setGroupStatus(@CurrentTenant() ctx: TenantContext, @Param('groupId') groupId: string, @Body() dto: GroupStatusDto) {
    return this.superadmin.setGroupStatus(ctx, groupId, dto.status);
  }

  @Get('groups/:groupId/wallet/ledger')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Paginated prepaid-wallet ledger for a group.' })
  walletLedger(@CurrentTenant() ctx: TenantContext, @Param('groupId') groupId: string, @Query() query: AdminListQueryDto) {
    return this.superadmin.walletLedger(ctx, groupId, query);
  }

  @Get('groups/:groupId/cost-rules')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Cost-rule version history for a group.' })
  listCostRules(@CurrentTenant() ctx: TenantContext, @Param('groupId') groupId: string) {
    return this.superadmin.listCostRules(ctx, groupId);
  }

  @Post('groups/:groupId/brands')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Create a brand under a group.' })
  createBrand(@CurrentTenant() ctx: TenantContext, @Param('groupId') groupId: string, @Body() dto: CreateBrandDto) {
    return this.superadmin.createBrand(ctx, { groupId, ...dto });
  }

  @Get('brands')
  @RequirePermissions('platform.report.read')
  listBrands(@CurrentTenant() ctx: TenantContext, @Query('groupId') groupId?: string) {
    return this.superadmin.listBrands(ctx, groupId);
  }

  @Get('search')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Global search across merchants, brands, and customers.' })
  search(@CurrentTenant() ctx: TenantContext, @Query('q') q: string) {
    return this.superadmin.search(ctx, q ?? '');
  }

  @Get('settings')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Platform-wide settings & defaults.' })
  getPlatformSettings(@CurrentTenant() ctx: TenantContext) {
    return this.superadmin.getPlatformSettings(ctx);
  }

  @Patch('settings')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Update platform-wide settings & defaults.' })
  setPlatformSettings(@CurrentTenant() ctx: TenantContext, @Body() dto: PlatformSettingsDto) {
    return this.superadmin.setPlatformSettings(ctx, dto);
  }

  @Patch('brands/:brandId')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Update a brand (name, currency, status, branding).' })
  updateBrand(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string, @Body() dto: UpdateBrandDto) {
    return this.superadmin.updateBrand(ctx, brandId, dto);
  }

  @Post('brands/:brandId/branches')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Create a branch under a brand.' })
  createBranch(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string, @Body() dto: CreateBranchDto) {
    return this.superadmin.createBranch(ctx, { brandId, ...dto });
  }

  @Get('brands/:brandId/branches')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'List a brand’s branches with terminal counts.' })
  listBranches(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string) {
    return this.superadmin.listBranches(ctx, brandId);
  }

  @Patch('branches/:branchId/status')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Enable / disable a branch.' })
  setBranchStatus(@CurrentTenant() ctx: TenantContext, @Param('branchId') branchId: string, @Body() dto: EntityStatusDto) {
    return this.superadmin.setBranchStatus(ctx, branchId, dto.status);
  }

  @Get('brands/:brandId/terminals')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'List a brand’s POS terminals.' })
  listTerminals(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string) {
    return this.superadmin.listTerminals(ctx, brandId);
  }

  @Post('brands/:brandId/terminals')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Register a POS terminal under a branch.' })
  createTerminal(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string, @Body() dto: CreateTerminalDto) {
    return this.superadmin.createTerminal(ctx, { brandId, branchId: dto.branchId, label: dto.label });
  }

  @Patch('terminals/:terminalId/status')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Enable / disable a POS terminal.' })
  setTerminalStatus(@CurrentTenant() ctx: TenantContext, @Param('terminalId') terminalId: string, @Body() dto: EntityStatusDto) {
    return this.superadmin.setTerminalStatus(ctx, terminalId, dto.status);
  }

  @Post('groups/:groupId/wallet/topup')
  @RequirePermissions('group.wallet.manage')
  @ApiOperation({ summary: 'Credit (top up) a merchant group prepaid wallet.' })
  topUp(@CurrentTenant() ctx: TenantContext, @Param('groupId') groupId: string, @Body() dto: TopUpDto) {
    return this.superadmin.topUpWallet(ctx, groupId, dto.amountMinor, dto.currency ?? 'AED', dto.idempotencyKey);
  }

  @Post('groups/:groupId/cost-rule')
  @RequirePermissions('group.wallet.manage')
  @ApiOperation({ summary: 'Set the hybrid drawdown cost model for a group.' })
  setCostRule(@CurrentTenant() ctx: TenantContext, @Param('groupId') groupId: string, @Body() dto: CostRuleDto) {
    return this.superadmin.setCostRule(ctx, groupId, dto);
  }

  // ── platform breadth (W6) ───────────────────────────────────────────────────
  @Get('analytics')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Cross-merchant platform analytics + per-merchant rollup.' })
  analytics(@CurrentTenant() ctx: TenantContext) {
    return this.superadmin.platformAnalytics(ctx);
  }

  @Get('brands-directory')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'All brands across merchants with members + liability.' })
  brandsDirectory(@CurrentTenant() ctx: TenantContext) {
    return this.superadmin.brandsDirectory(ctx);
  }

  @Get('wallet/low-balance')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Merchant wallets below their low-balance threshold.' })
  lowBalance(@CurrentTenant() ctx: TenantContext) {
    return this.superadmin.lowBalanceAlerts(ctx);
  }

  @Get('audit-logs')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Platform-wide tamper-evident audit log.' })
  auditLogs(@CurrentTenant() ctx: TenantContext, @Query() query: AdminListQueryDto, @Query('brandId') brandId?: string) {
    return this.superadmin.auditLogs(ctx, { q: query.q, brandId, limit: query.limit, offset: query.offset });
  }

  @Get('team')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Platform-scoped team members + roles.' })
  team(@CurrentTenant() ctx: TenantContext) {
    return this.superadmin.platformTeam(ctx);
  }

  @Get('team/roles')
  @RequirePermissions('platform.report.read')
  teamRoles() {
    return this.superadmin.platformRoleOptions();
  }

  @Post('team/invite')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Invite a platform teammate + assign a role (temp password once).' })
  inviteTeam(@CurrentTenant() ctx: TenantContext, @Body() dto: InviteTeamDto) {
    return this.superadmin.invitePlatformMember(ctx, dto);
  }

  @Patch('team/:userId/role')
  @RequirePermissions('platform.manage')
  updateTeamRole(@CurrentTenant() ctx: TenantContext, @Param('userId') userId: string, @Body() dto: TeamRoleDto) {
    return this.superadmin.updatePlatformMemberRole(ctx, userId, dto.roleKey);
  }

  @Delete('team/:userId')
  @RequirePermissions('platform.manage')
  revokeTeam(@CurrentTenant() ctx: TenantContext, @Param('userId') userId: string) {
    return this.superadmin.revokePlatformMember(ctx, userId);
  }

  @Get('brands/:brandId/modules')
  @RequirePermissions('platform.report.read')
  @ApiOperation({ summary: 'Per-brand module entitlements (what the brand can see/use).' })
  getModules(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string) {
    return this.superadmin.getBrandModules(ctx, brandId);
  }

  @Patch('brands/:brandId/modules')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Toggle which modules a brand can access.' })
  setModules(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string, @Body() dto: SetModulesDto) {
    return this.superadmin.setBrandModules(ctx, brandId, dto.access);
  }

  @Post('brands/:brandId/act-as')
  @RequirePermissions('platform.manage')
  @ApiOperation({ summary: 'Get a brand-scoped token to manage this brand directly (audited).' })
  actAs(@CurrentTenant() ctx: TenantContext, @Param('brandId') brandId: string) {
    return this.superadmin.actAsBrand(ctx, brandId);
  }
}
