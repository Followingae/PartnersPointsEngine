import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AppliersRegistry, type EntityApplier } from '../governance/appliers.registry';
import { CampaignService } from './campaign.service';
import { GamificationService } from './gamification.service';
import { LoyaltyService } from './loyalty.service';

type Rec = Record<string, unknown>;
const asId = (r: unknown) => ({ id: (r as { id: string }).id });
const asRec = (r: unknown) => (r ? (r as Rec) : null);

/**
 * Registers the brand's governed entities (the 6 loyalty-config types) into the
 * shared AppliersRegistry so the governance engine can snapshot, diff, and apply
 * approved change-requests generically. Each applier delegates to the real
 * service methods (which validate + audit), so an approved request is identical
 * to a direct edit.
 */
@Injectable()
export class LoyaltyAppliers implements OnModuleInit {
  constructor(
    private readonly registry: AppliersRegistry,
    private readonly loyalty: LoyaltyService,
    private readonly campaigns: CampaignService,
    private readonly gamification: GamificationService,
  ) {}

  onModuleInit(): void {
    const reg = (type: string, a: EntityApplier) => this.registry.register(type, a);

    reg('earn_rule', {
      fetch: (ctx, id) => this.loyalty.getEarnRule(ctx, id).then(asRec),
      create: (ctx, p) => this.loyalty.createEarnRule(ctx, p as never).then(asId),
      update: (ctx, id, p) => this.loyalty.updateEarnRule(ctx, id, p as never),
      remove: (ctx, id) => this.loyalty.deleteEarnRule(ctx, id),
    });
    reg('reward', {
      fetch: (ctx, id) => this.loyalty.getReward(ctx, id).then(asRec),
      create: (ctx, p) => this.loyalty.createCatalogItem(ctx, p as never).then(asId),
      update: (ctx, id, p) => this.loyalty.updateReward(ctx, id, p as never),
      remove: (ctx, id) => this.loyalty.deleteReward(ctx, id),
    });
    reg('tier', {
      fetch: (ctx, id) => this.loyalty.getTier(ctx, id).then(asRec),
      create: (ctx, p) => this.loyalty.createTier(ctx, p as never).then(asId),
      update: (ctx, id, p) => this.loyalty.updateTier(ctx, id, p as never),
      remove: (ctx, id) => this.loyalty.deleteTier(ctx, id),
    });
    reg('campaign', {
      fetch: (ctx, id) => this.campaigns.getCampaign(ctx, id).then(asRec),
      create: (ctx, p) => this.campaigns.createCampaign(ctx, p as never).then(asId),
      update: (ctx, id, p) => this.campaigns.updateCampaign(ctx, id, p as never),
      remove: (ctx, id) => this.campaigns.deleteCampaign(ctx, id),
    });
    reg('badge', {
      fetch: (ctx, id) => this.gamification.getBadge(ctx, id).then(asRec),
      create: (ctx, p) => this.gamification.createBadge(ctx, p as never).then(asId),
      update: (ctx, id, p) => this.gamification.updateBadge(ctx, id, p as never),
      remove: (ctx, id) => this.gamification.deleteBadge(ctx, id),
    });
    reg('challenge', {
      fetch: (ctx, id) => this.gamification.getChallenge(ctx, id).then(asRec),
      create: (ctx, p) => this.gamification.createChallenge(ctx, p as never).then(asId),
      update: (ctx, id, p) => this.gamification.updateChallenge(ctx, id, p as never),
      remove: (ctx, id) => this.gamification.deleteChallenge(ctx, id),
    });
  }
}
