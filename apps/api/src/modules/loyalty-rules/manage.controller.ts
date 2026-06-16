import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { Governed } from '../governance/governed.decorator';
import { GovernanceInterceptor } from '../governance/governance.interceptor';
import {
  AdminEarnDto,
  CreateBadgeDto,
  CreateCampaignDto,
  CreateCatalogItemDto,
  CreateChallengeDto,
  CreateEarnRuleDto,
  CreateTierDto,
  ListQueryDto,
  UpdateBadgeDto,
  UpdateCampaignDto,
  UpdateCatalogItemDto,
  UpdateChallengeDto,
  UpdateEarnRuleDto,
  UpdateSettingsDto,
  UpdateTierDto,
} from './dto';
import { CampaignService } from './campaign.service';
import { GamificationService } from './gamification.service';
import { LoyaltyService } from './loyalty.service';

/** Brand-admin surface — manage the brand's loyalty program (full CRUD). */
@ApiTags('brand-admin')
@ApiBearerAuth('admin')
@Controller('manage')
@UseGuards(AdminJwtGuard, PermissionsGuard)
@UseInterceptors(GovernanceInterceptor)
export class ManageController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly campaigns: CampaignService,
    private readonly gamification: GamificationService,
  ) {}

  // ── earn rules ─────────────────────────────────────────────────────────────
  @Get('earn-rules')
  @RequirePermissions('brand.report.read')
  listEarnRules(@CurrentTenant() ctx: TenantContext, @Query() query: ListQueryDto) {
    return this.loyalty.listEarnRules(ctx, query);
  }

  @Get('earn-rules/:id')
  @RequirePermissions('brand.report.read')
  getEarnRule(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.getEarnRule(ctx, id);
  }

  @Post('earn-rules')
  @Governed('earn_rule')
  @RequirePermissions('brand.campaign.write')
  @ApiOperation({ summary: 'Create an earn rule (validated against the rules engine).' })
  createEarnRule(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateEarnRuleDto) {
    return this.loyalty.createEarnRule(ctx, dto);
  }

  @Patch('earn-rules/:id')
  @Governed('earn_rule')
  @RequirePermissions('brand.campaign.write')
  updateEarnRule(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateEarnRuleDto) {
    return this.loyalty.updateEarnRule(ctx, id, dto);
  }

  @Delete('earn-rules/:id')
  @Governed('earn_rule')
  @RequirePermissions('brand.campaign.write')
  deleteEarnRule(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.deleteEarnRule(ctx, id);
  }

  @Post('earn-rules/:id/clone')
  @RequirePermissions('brand.campaign.write')
  cloneEarnRule(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.cloneEarnRule(ctx, id);
  }

  // ── rewards ────────────────────────────────────────────────────────────────
  @Get('rewards')
  @RequirePermissions('brand.report.read')
  listRewards(@CurrentTenant() ctx: TenantContext, @Query() query: ListQueryDto) {
    return this.loyalty.listRewards(ctx, query);
  }

  @Get('rewards/:id')
  @RequirePermissions('brand.report.read')
  getReward(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.getReward(ctx, id);
  }

  @Post('rewards')
  @Governed('reward')
  @RequirePermissions('brand.campaign.write')
  @ApiOperation({ summary: 'Add a reward catalog item.' })
  createCatalogItem(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateCatalogItemDto) {
    return this.loyalty.createCatalogItem(ctx, dto);
  }

  @Patch('rewards/:id')
  @Governed('reward')
  @RequirePermissions('brand.campaign.write')
  updateReward(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateCatalogItemDto) {
    return this.loyalty.updateReward(ctx, id, dto);
  }

  @Delete('rewards/:id')
  @Governed('reward')
  @RequirePermissions('brand.campaign.write')
  deleteReward(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.deleteReward(ctx, id);
  }

  @Post('rewards/:id/clone')
  @RequirePermissions('brand.campaign.write')
  cloneReward(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.cloneReward(ctx, id);
  }

  // ── tiers ──────────────────────────────────────────────────────────────────
  @Get('tiers')
  @RequirePermissions('brand.report.read')
  listTiers(@CurrentTenant() ctx: TenantContext, @Query() query: ListQueryDto) {
    return this.loyalty.listTiers(ctx, query);
  }

  @Get('tiers/:id')
  @RequirePermissions('brand.report.read')
  getTier(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.getTier(ctx, id);
  }

  @Post('tiers')
  @Governed('tier')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Define a membership tier.' })
  createTier(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateTierDto) {
    return this.loyalty.createTier(ctx, dto);
  }

  @Patch('tiers/:id')
  @Governed('tier')
  @RequirePermissions('brand.manage')
  updateTier(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateTierDto) {
    return this.loyalty.updateTier(ctx, id, dto);
  }

  @Delete('tiers/:id')
  @Governed('tier')
  @RequirePermissions('brand.manage')
  deleteTier(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.deleteTier(ctx, id);
  }

  // ── campaigns ──────────────────────────────────────────────────────────────
  @Get('campaigns')
  @RequirePermissions('brand.report.read')
  listCampaigns(@CurrentTenant() ctx: TenantContext, @Query() query: ListQueryDto) {
    return this.campaigns.listCampaigns(ctx, query);
  }

  @Get('campaigns/:id')
  @RequirePermissions('brand.report.read')
  getCampaign(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.campaigns.getCampaign(ctx, id);
  }

  @Post('campaigns')
  @Governed('campaign')
  @RequirePermissions('brand.campaign.write')
  @ApiOperation({ summary: 'Create a time-boxed campaign (validated against the rules engine).' })
  createCampaign(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateCampaignDto) {
    return this.campaigns.createCampaign(ctx, dto);
  }

  @Patch('campaigns/:id')
  @Governed('campaign')
  @RequirePermissions('brand.campaign.write')
  updateCampaign(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.updateCampaign(ctx, id, dto);
  }

  @Delete('campaigns/:id')
  @Governed('campaign')
  @RequirePermissions('brand.campaign.write')
  deleteCampaign(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.campaigns.deleteCampaign(ctx, id);
  }

  @Post('campaigns/:id/clone')
  @RequirePermissions('brand.campaign.write')
  cloneCampaign(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.campaigns.cloneCampaign(ctx, id);
  }

  // ── badges ─────────────────────────────────────────────────────────────────
  @Get('badges')
  @RequirePermissions('brand.report.read')
  listBadges(@CurrentTenant() ctx: TenantContext, @Query() query: ListQueryDto) {
    return this.gamification.listBadgesCatalog(ctx, query);
  }

  @Get('badges/:id')
  @RequirePermissions('brand.report.read')
  getBadge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.gamification.getBadge(ctx, id);
  }

  @Post('badges')
  @Governed('badge')
  @RequirePermissions('brand.campaign.write')
  @ApiOperation({ summary: 'Create a badge.' })
  createBadge(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateBadgeDto) {
    return this.gamification.createBadge(ctx, dto);
  }

  @Patch('badges/:id')
  @Governed('badge')
  @RequirePermissions('brand.campaign.write')
  updateBadge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateBadgeDto) {
    return this.gamification.updateBadge(ctx, id, dto);
  }

  @Delete('badges/:id')
  @Governed('badge')
  @RequirePermissions('brand.campaign.write')
  deleteBadge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.gamification.deleteBadge(ctx, id);
  }

  // ── challenges ─────────────────────────────────────────────────────────────
  @Get('challenges')
  @RequirePermissions('brand.report.read')
  listChallenges(@CurrentTenant() ctx: TenantContext, @Query() query: ListQueryDto) {
    return this.gamification.listChallenges(ctx, query);
  }

  @Get('challenges/:id')
  @RequirePermissions('brand.report.read')
  getChallenge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.gamification.getChallenge(ctx, id);
  }

  @Post('challenges')
  @Governed('challenge')
  @RequirePermissions('brand.campaign.write')
  @ApiOperation({ summary: 'Create a challenge (lifetime-points / visits / spend).' })
  createChallenge(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateChallengeDto) {
    return this.gamification.createChallenge(ctx, dto);
  }

  @Patch('challenges/:id')
  @Governed('challenge')
  @RequirePermissions('brand.campaign.write')
  updateChallenge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateChallengeDto) {
    return this.gamification.updateChallenge(ctx, id, dto);
  }

  @Delete('challenges/:id')
  @Governed('challenge')
  @RequirePermissions('brand.campaign.write')
  deleteChallenge(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.gamification.deleteChallenge(ctx, id);
  }

  // ── members / customer 360 ───────────────────────────────────────────────
  @Get('members')
  @RequirePermissions('brand.customer.read')
  listMembers(@CurrentTenant() ctx: TenantContext, @Query() query: ListQueryDto) {
    return this.loyalty.listMembers(ctx, query);
  }

  @Get('customers/:id/profile')
  @RequirePermissions('brand.customer.read')
  @ApiOperation({ summary: 'Customer 360 — balance, tier, transactions, badges, referrals.' })
  customerProfile(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.customerProfile(ctx, id);
  }

  @Get('customers/:id/export')
  @RequirePermissions('brand.customer.read')
  @ApiOperation({ summary: 'GDPR data-subject export (JSON).' })
  exportCustomer(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.exportCustomer(ctx, id);
  }

  @Delete('customers/:id')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'GDPR erasure — archive the membership.' })
  eraseCustomer(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.loyalty.eraseCustomer(ctx, id);
  }

  // ── module entitlements (read-only; superadmin controls) ──────────────────
  @Get('modules')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'This brand’s module entitlements (drives console nav).' })
  modules(@CurrentTenant() ctx: TenantContext) {
    return this.loyalty.getModuleAccess(ctx);
  }

  // ── settings ─────────────────────────────────────────────────────────────
  @Get('settings')
  @RequirePermissions('brand.report.read')
  getSettings(@CurrentTenant() ctx: TenantContext) {
    return this.loyalty.getSettings(ctx);
  }

  @Patch('settings')
  @RequirePermissions('brand.manage')
  updateSettings(@CurrentTenant() ctx: TenantContext, @Body() dto: UpdateSettingsDto) {
    return this.loyalty.updateSettings(ctx, dto);
  }

  // ── audit log ────────────────────────────────────────────────────────────
  @Get('audit-logs')
  @RequirePermissions('brand.report.read')
  listAuditLogs(@CurrentTenant() ctx: TenantContext, @Query() query: ListQueryDto) {
    return this.loyalty.listAuditLogs(ctx, query);
  }

  @Post('customers/earn')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Trigger an earn for a member (admin/back-office; POS uses the terminal API).' })
  earn(@CurrentTenant() ctx: TenantContext, @Body() dto: AdminEarnDto) {
    return this.loyalty.earn(ctx, {
      membershipId: dto.membershipId,
      amountMinor: dto.amountMinor,
      channel: dto.channel,
      isVisit: dto.isVisit,
      items: dto.items,
      sourceEvent: dto.sourceEvent,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
